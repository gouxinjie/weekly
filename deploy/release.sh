#!/usr/bin/env bash
#
# weekly 发布脚本（pm2 守护）
#
# 用法：bash /var/www/weekly/deploy/release.sh <发布包路径> [版本标识]
#
# 由 GitHub Actions 在部署阶段调用，也可在服务器上手动执行同一套流程。
# 流程：备份数据库 → 暂存旧产物 → 解包 → 按需重装生产依赖 → pm2 重载 → 健康检查，
# 健康检查失败会自动回滚到上一版产物，并以非 0 退出码结束，让 CI 明确报错。
#
# 说明：本脚本与 ecosystem.config.cjs 均由 CI 每次发布时同步到
#      /var/www/weekly/deploy/，请修改仓库中的副本，不要直接改服务器上的文件。

set -euo pipefail

# ---- 配置 -----------------------------------------------------------------

APP_DIR="/var/www/weekly"
APP_NAME="weekly"                                    # 必须与 ecosystem.config.cjs 的 name 一致
ECOSYSTEM_FILE="${APP_DIR}/deploy/ecosystem.config.cjs"
HEALTH_RETRY=30            # 健康检查重试次数，每次间隔 1 秒
KEEP_RELEASES=5            # releases/ 目录保留的发布包数量，更早的自动清理

# 运行用户：必须与「持有 pm2 进程的那个用户」一致，否则 SQLite 文件属主不对，
# 进程启动后写库会直接失败。默认取当前执行者（CI 以 SSH 用户登录，pm2 也由该用户持有）。
APP_USER="${APP_USER:-$(id -un)}"

# ---- 入参校验 -------------------------------------------------------------

PKG="${1:-}"
RELEASE_ID="${2:-manual}"

if [[ -z "${PKG}" || ! -f "${PKG}" ]]; then
  echo "[错误] 发布包不存在：${PKG}" >&2
  exit 1
fi

cd "${APP_DIR}"
mkdir -p "${APP_DIR}/data" "${APP_DIR}/backup" "${APP_DIR}/releases"

# SSH 执行的是非交互 shell，不会加载 nvm 等 shell 配置，
# 因此 pm2 不能只依赖 PATH，需要在常见位置探测一次
resolve_pm2() {
  if command -v pm2 >/dev/null 2>&1; then
    command -v pm2
    return 0
  fi

  local candidate
  for candidate in /usr/local/bin/pm2 /usr/bin/pm2 \
    "${HOME}"/.nvm/versions/node/*/bin/pm2 \
    /usr/local/nvm/versions/node/*/bin/pm2; do
    if [[ -x "${candidate}" ]]; then
      echo "${candidate}"
      return 0
    fi
  done

  return 1
}

PM2_BIN="$(resolve_pm2 || true)"
if [[ -z "${PM2_BIN}" ]]; then
  echo "[错误] 未找到 pm2，请确认部署用户能执行 pm2（nvm 安装时检查版本目录）" >&2
  exit 1
fi

# 健康检查端口取自 .env，避免脚本写死端口后与后端实际监听脱节
ENV_PORT="$(grep -E '^[[:space:]]*PORT[[:space:]]*=' "${APP_DIR}/.env" 2>/dev/null | tail -n 1 | cut -d= -f2 | tr -d '[:space:]' || true)"
HEALTH_URL="http://127.0.0.1:${ENV_PORT:-3701}/api/health"

echo "[发布] 版本：${RELEASE_ID}"
echo "       pm2：${PM2_BIN}，运行用户：${APP_USER}"

# ---- 1. 发布前备份数据库 --------------------------------------------------

# 备份统一走 deploy/backup.sh（内部是 Node + better-sqlite3）：
# 线上 sqlite3 CLI 是 3.26，不支持 VACUUM INTO（3.27 才引入），直接调用会报语法错误。
# 备份失败只警告、不中断发布——发布只覆盖 dist，不动数据库；
# 但出现警告必须人工确认备份链路，否则会悄悄失去发布前的快照。
if [[ ! -f "${APP_DIR}/data/weekly.db" ]]; then
  echo "[1/6] 数据库尚不存在（首次部署），跳过发布前备份"
elif bash "${APP_DIR}/deploy/backup.sh"; then
  echo "[1/6] 发布前备份完成"
else
  echo "[1/6] [警告] 发布前备份失败，继续发布；请检查上面的报错与磁盘空间" >&2
fi

# ---- 2. 暂存旧产物，供回滚使用 --------------------------------------------

rm -rf "${APP_DIR}/.prev"
mkdir -p "${APP_DIR}/.prev"

if [[ -d "${APP_DIR}/web/dist" ]]; then
  mv "${APP_DIR}/web/dist" "${APP_DIR}/.prev/web-dist"
fi

if [[ -d "${APP_DIR}/server/dist" ]]; then
  mv "${APP_DIR}/server/dist" "${APP_DIR}/.prev/server-dist"
fi

# ---- 3. 解包新产物 --------------------------------------------------------

tar -xzf "${PKG}" -C "${APP_DIR}"
echo "[2/6] 产物已解包"

# ---- 4. 生产依赖：仅在 package-lock.json 变化时重装 -----------------------

LOCK_HASH="$(sha256sum "${APP_DIR}/server/package-lock.json" | awk '{print $1}')"
HASH_FILE="${APP_DIR}/server/.deps-hash"

if [[ -f "${HASH_FILE}" && "$(cat "${HASH_FILE}")" == "${LOCK_HASH}" ]]; then
  echo "[3/6] package-lock.json 未变化，跳过 npm ci"
else
  echo "[3/6] 依赖有变化，执行 npm ci --omit=dev（含原生模块编译，可能较慢）"
  ( cd "${APP_DIR}/server" && npm ci --omit=dev --no-audit --no-fund )
  printf '%s' "${LOCK_HASH}" > "${HASH_FILE}"
fi

# ---- 5. 属主修正 ----------------------------------------------------------

if id "${APP_USER}" >/dev/null 2>&1; then
  # 运行用户必须能写 data/（SQLite），否则进程启动后写库直接失败
  chown -R "${APP_USER}:${APP_USER}" \
    "${APP_DIR}/web" "${APP_DIR}/server" "${APP_DIR}/data" "${APP_DIR}/backup" 2>/dev/null || true
else
  echo "[警告] 系统不存在用户 ${APP_USER}，跳过属主修正" >&2
fi

# ---- 6. pm2 重载并健康检查 ------------------------------------------------

echo "[4/6] pm2 重载 ${APP_NAME}"
# startOrReload：进程不存在时创建、已存在时重载，首次部署与后续发布共用同一条命令。
# fork 单实例下 reload 等价于重启，会有约 1 秒不可用，可接受。
"${PM2_BIN}" startOrReload "${ECOSYSTEM_FILE}" --update-env

echo "[5/6] 健康检查：${HEALTH_URL}"
HEALTHY=0
for _ in $(seq 1 "${HEALTH_RETRY}"); do
  if curl -fsS "${HEALTH_URL}" >/dev/null 2>&1; then
    HEALTHY=1
    break
  fi
  sleep 1
done

if [[ "${HEALTHY}" -ne 1 ]]; then
  echo "[错误] 健康检查未通过，回滚到上一版产物" >&2

  if [[ -d "${APP_DIR}/.prev/web-dist" ]]; then
    rm -rf "${APP_DIR}/web/dist"
    mv "${APP_DIR}/.prev/web-dist" "${APP_DIR}/web/dist"
  fi

  if [[ -d "${APP_DIR}/.prev/server-dist" ]]; then
    rm -rf "${APP_DIR}/server/dist"
    mv "${APP_DIR}/.prev/server-dist" "${APP_DIR}/server/dist"
  fi

  "${PM2_BIN}" startOrReload "${ECOSYSTEM_FILE}" --update-env || true
  # 回滚后仍打印进程日志，便于直接定位失败原因
  "${PM2_BIN}" logs "${APP_NAME}" --lines 50 --nostream || true
  exit 1
fi

# ---- 7. 持久化与清理 ------------------------------------------------------

rm -rf "${APP_DIR}/.prev"

# 持久化进程列表：pm2 startup 生成的开机自启单元读的就是 pm2 的 dump 文件，
# 漏掉这一步，机器重启后服务不会自己起来
"${PM2_BIN}" save >/dev/null

mapfile -t OLD_PKGS < <(ls -1t "${APP_DIR}"/releases/*.tar.gz 2>/dev/null || true)
if [[ "${#OLD_PKGS[@]}" -gt "${KEEP_RELEASES}" ]]; then
  printf '%s\n' "${OLD_PKGS[@]:${KEEP_RELEASES}}" | xargs -r rm -f
fi

echo "[6/6] 发布完成：${RELEASE_ID}"
