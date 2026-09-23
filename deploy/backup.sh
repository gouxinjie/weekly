#!/usr/bin/env bash
#
# weekly 数据库备份入口（cron 与发布脚本都调用它）
#
# 建议加入 root 的 crontab：
#   0 3 * * * /var/www/weekly/deploy/backup.sh
#
# 真正的备份逻辑在 backup.cjs，原因：线上 sqlite3 CLI 是 3.26（2018），
# 不支持 VACUUM INTO（SQLite 3.27 才引入），而项目依赖的 better-sqlite3
# 内置了较新的 SQLite，因此备份统一交给 Node 完成，不依赖系统包版本。
#
# 必须在服务运行时备份（VACUUM INTO 会走读事务，拿到一致性快照）；
# 不要直接 cp 数据库文件——WAL 模式下可能得到不一致的快照。

set -euo pipefail

APP_DIR="/var/www/weekly"
KEEP_DAYS="${KEEP_DAYS:-30}"

# cron 与 SSH 非交互 shell 的 PATH 都很干净，可能拿不到 nvm 装的 node，
# 因此这里显式探测一次，不依赖调用方的环境
resolve_node() {
  if command -v node >/dev/null 2>&1; then
    command -v node
    return 0
  fi

  local candidate
  for candidate in /usr/local/bin/node /usr/bin/node \
    "${HOME}"/.nvm/versions/node/*/bin/node \
    /usr/local/nvm/versions/node/*/bin/node; do
    if [[ -x "${candidate}" ]]; then
      echo "${candidate}"
      return 0
    fi
  done

  return 1
}

NODE_BIN="$(resolve_node || true)"
if [[ -z "${NODE_BIN}" ]]; then
  echo "[备份] [错误] 未找到 node，无法执行备份" >&2
  exit 1
fi

exec "${NODE_BIN}" "${APP_DIR}/deploy/backup.cjs" "${KEEP_DAYS}"
