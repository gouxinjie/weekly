# weekly 部署手册

> 目标：阿里云 ECS + Nginx + pm2，域名 `weekly.gouxinjie.com`，HTTP。
> 与代码冲突时，以 `deploy/` 脚本与 `.github/workflows/deploy.yml` 为准。
>
> **脱敏约定**：服务器 IP 记作 `<ECS_IP>`，同机其他应用统称「同机其他应用」；域名是产品的公开标识（已出现在 README / PRD / 配置中），保留。

---

## 一、架构

### 1.1 运行时分层

```
┌────────────────────────── 公网 ───────────────────────────┐
│  浏览器  http://weekly.gouxinjie.com                      │
└──────────────────────────┬────────────────────────────────┘
                           │ :80
┌──────────────────────────▼────────────────────────────────┐
│  Nginx 1.20.1（systemd 管理）                              │
│  配置 /etc/nginx/conf.d/server_weekly.conf                │
│    ├── /      → root /var/www/weekly/web/dist（静态直读）  │
│    └── /api/  → proxy_pass 127.0.0.1:3701（透传 X-Real-IP）│
└──────────────────────────┬────────────────────────────────┘
                           │ :3701（仅本机回环，公网不可达）
┌──────────────────────────▼────────────────────────────────┐
│  Node 20 进程（pm2 守护，进程名 weekly）                   │
│  入口 /var/www/weekly/server/dist/index.js（Fastify）      │
│  配置 /var/www/weekly/.env                                │
└──────────────────────────┬────────────────────────────────┘
                           │ WAL
┌──────────────────────────▼────────────────────────────────┐
│  /var/www/weekly/data/weekly.db（+ -wal / -shm）           │
└───────────────────────────────────────────────────────────┘
```

安全边界：Node 只监听 `127.0.0.1`，公网入口仅 Nginx 的 80；安全组只放行 **22 / 80**，**不放** 3701。

### 1.2 发布链路

```
git push origin main
  └─ GitHub Actions「部署到阿里云 ECS」
       ├─ build  ：Node 20 构建 web/dist + server/dist → 打包 release.tar.gz
       └─ deploy ：① mkdir 确保服务器目录存在
                   ② scp 上传发布包，并同步 deploy/ 下的脚本（含 release.sh）
                   ③ ssh 执行【服务器上】的 /var/www/weekly/deploy/release.sh
                   ④ 从公网验证首页与 /api/health
```

### 1.3 谁负责什么

CI 跑在 GitHub 的**临时虚拟机**上（用完即销毁，不持有任何项目数据），ECS 才是长期运行的工地：

| | CI runner | ECS |
|---|---|---|
| 生命周期 | 每次一台新机器，结束即销毁 | 长期运行 |
| 拿到什么 | 仓库代码（含 devDependencies）+ Secrets | 只有构建产物与 `deploy/` 脚本 |
| 干什么 | 编译 TS、打包静态资源、上传、触发发布、公网验证 | 装生产依赖、跑服务、读写数据库 |
| 有什么数据 | **没有** | 数据库 + 配置 + 备份 |

**CI 明确不管的事**：

- 不碰 `.env` 与 `data/`（发布包里没有它们）
- 不装生产依赖（`npm ci --omit=dev` 在服务器执行，原生模块要按目标机 ABI 编译）
- 不改 Nginx 配置（入口配置人工同步）
- 不做回滚（回滚逻辑在 `release.sh` 内部；CI 只把失败以非 0 退出码暴露出来）
- 不持久化凭据（Secrets 只在运行时注入 runner 内存，日志打码）

**划分原则**：与机器状态绑定的事（编译原生模块、改属主、重启本机进程、读写本机数据库）留给服务器；与机器无关的事（编译 TypeScript、打包静态资源）放在 CI。runner 上的状态会随它一起消失。

流水线约束：`deploy` 依赖 `build`（构建失败不触碰服务器）；`concurrency: deploy-production`（同一时刻只跑一个发布）。

### 1.4 关键路径

| 项目 | 值 |
|---|---|
| 应用根目录 | `/var/www/weekly` |
| 后端 | Fastify，`127.0.0.1:3701`，pm2 进程名 `weekly` |
| 前端 | `web/dist`，Nginx 直接托管 |
| Nginx 配置 | `/etc/nginx/conf.d/server_weekly.conf` |
| 数据库 | `/var/www/weekly/data/weekly.db` |
| 发布包 | `/var/www/weekly/releases/release-<短SHA>.tar.gz`，保留最近 5 个 |
| 备份 | `/var/www/weekly/backup/weekly-YYYY-MM-DD.db`，保留 30 天 |

服务器目录：

```
/var/www/weekly/
├── .env                     # 生产配置，手工放置一次，CI 永不覆盖
├── deploy/                  # 部署脚本，每次发布由 CI 上传覆盖（仓库里的副本才是源）
├── releases/                # 发布包
├── data/weekly.db           # 数据库（唯一数据源）
├── backup/                  # 快照
├── server/                  # dist/ + package.json + package-lock.json + node_modules（无 src/）
└── web/dist/                # 前端产物
```

发布包只含 `web/dist`、`server/dist`、`server/package.json`、`server/package-lock.json`。

---

## 二、服务端怎么部署、怎么启动

### 2.1 两条链路

```
【部署链】源码 → 服务器上的文件
  server/src/*.ts
    └─ CI：npm ci && npm run build（tsc） → server/dist/*.js（CommonJS）
         └─ 打包（仅 dist + package*.json） → scp → /var/www/weekly/releases/
              └─ release.sh 解包 → /var/www/weekly/server/dist
                   └─ 按需 npm ci --omit=dev → /var/www/weekly/server/node_modules

【启动链】服务器上的文件 → 对外可用的服务
  pm2（daemon 由 root 持有）
    └─ pm2 startOrReload deploy/ecosystem.config.cjs --update-env
         └─ node dist/index.js（cwd = /var/www/weekly/server）
              ├─ 1. 读配置      config.ts → /var/www/weekly/.env
              ├─ 2. 打开数据库  data/weekly.db（WAL + 外键）
              ├─ 3. 执行迁移    按 PRAGMA user_version 建表/升级
              ├─ 4. 注册路由    Fastify：cookie、/api/health、业务路由、错误处理
              └─ 5. 开始监听    listen(3701, 127.0.0.1) → 等 Nginx 反代
```

两条链路的交界点是 **`server/dist`**：部署链更新它，启动链只认它。服务器上没有 `src/`，是刻意设计。

### 2.2 启动方式：pm2 + ecosystem.config.cjs

```js
// deploy/ecosystem.config.cjs
{ name: 'weekly', script: 'dist/index.js', cwd: '/var/www/weekly/server',
  instances: 1, exec_mode: 'fork', env: { NODE_ENV: 'production' },
  autorestart: true, max_restarts: 10, restart_delay: 3000, time: true }
```

| 字段 | 要点 |
|---|---|
| `name` | pm2 进程名，`pm2 logs weekly` / `pm2 status weekly` 都用它 |
| `script` + `cwd` | 入口是编译产物 `dist/index.js`（相对 cwd），不能写 `src/index.ts` |
| `instances: 1` + `fork` | **SQLite 是单写者，不能多实例**，否则互相锁库 |
| `env.NODE_ENV` | 决定日志级别，且**优先于 `.env`** 里的同名项 |
| `max_restarts` / `restart_delay` | 连续失败 10 次后停止重试，间隔 3 秒，避免坏配置打满 CPU |

启动与查看：

```bash
# 启动/重载（CI 自动执行，也可手工）：不存在则创建，已存在则重载
pm2 startOrReload /var/www/weekly/deploy/ecosystem.config.cjs --update-env

pm2 status weekly
pm2 describe weekly        # 看 script path / cwd / node 版本 / 重启次数
pm2 logs weekly --lines 100 --nostream
```

**不要用 `pm2 start dist/index.js` 手工起进程**——那会创建一个不带 ecosystem 配置的野进程（名字、`cwd`、`NODE_ENV` 全是默认值），与 CI 创建的 `weekly` 抢同一个 3701 端口。永远通过 ecosystem 文件启动。

### 2.3 配置从哪来

```
① pm2 注入（ecosystem 的 env）   ← 优先级最高
② /var/www/weekly/.env（config.ts 用 process.loadEnvFile 读取）
③ 代码内置兜底（PORT=3701、HOST=127.0.0.1、DB_PATH=data/weekly.db、NODE_ENV=development…）
```

关键结论：`process.loadEnvFile` **不覆盖已存在的环境变量**，所以 pm2 注入的 `NODE_ENV=production` 永远赢过 `.env` 里的同名项——想改 `NODE_ENV` 得改 `ecosystem.config.cjs`，改 `.env` 是无效的。

`DB_PATH`、`.env` 这些相对/固定路径都由 `config.ts` 的 `ROOT_DIR = resolve(__dirname, '..', '..')` 推导：开发态是 `…/server/src` 上两级、生产态是 `/var/www/weekly/server/dist` 上两级，都落在应用根目录。**因此不能把 `dist` 挪到别处**。

### 2.4 启动顺序与失败表现

| 顺序 | 动作 | 失败表现 |
|---|---|---|
| 1 | 读 `.env`、校验配置 | 取值非法（如 `PORT` 不是整数）直接退出 |
| 2 | 建 `data/` 目录 → 打开库 → WAL + 外键 | 目录不可写 → `SQLITE_CANTOPEN` |
| 3 | 执行迁移（按 `user_version` 追加） | SQL 出错 → 启动失败，需人工介入 |
| 4 | 注册 cookie、`/api/health`、业务路由、错误处理 | 定义异常 → 启动失败 |
| 5 | `listen(3701, 127.0.0.1)` | 端口被占 → `EADDRINUSE` |

**第 3 步是发布顺序的约束来源**：迁移随启动执行，所以含表结构变更的发布必须「先重启（跑迁移）再验证」。

启动失败排查三件套：`pm2 status weekly`（看状态与 ↺ 次数）→ `pm2 logs weekly --lines 100 --nostream`（看堆栈）→ `pm2 describe weekly`（看 script path / cwd 是否符合预期）。常见原因：`dist` 不存在（未部署）、`node_modules` 缺失、端口被占、`data/` 属主不对。

重启代价：fork 单实例下 `reload ≈ 重启`，**每次发布约 1 秒不可用**，这是 SQLite 单写者约束下的取舍；WAL 保证不丢已提交数据。

---

## 三、关键设计取舍

> 换个环境部署时，可据此判断哪些结论仍然成立。

**3.1 用 pm2，不用 systemd** —— 目标机已有多个应用由同一个 pm2 daemon 守护，两套守护并存会抢 3701 端口，排障也容易看错地方。代价：pm2 由 **root** 持有，所以 CI 的 `ECS_USER` 必须是 root；开机自启要配 `pm2 startup` + `pm2 save`。

**3.2 备份走 Node，不用 sqlite3 CLI** —— 线上 `sqlite3` 是 3.26（2018），而 `VACUUM INTO` 要 SQLite **3.27** 才支持，照原方案首次部署就会中断。改用项目自带的 `better-sqlite3`（内置 SQLite 较新，且与服务同源）执行同一条语句。系统 `sqlite3` 只留作只读查询。

**3.3 适配 Node 20，不升级服务器** —— 该机 node 被同机其他应用共用，升级会连带重启它们；而 weekly 依赖全部支持 20（`better-sqlite3@12` 要求 `20.x || 22.x || ...`，`argon2@0.45` 要求 `>=16.17`），代码里唯一有下限的 API 是 `process.loadEnvFile`（≥ 20.12）。CI 版本随之为 20，避免「22 构建、20 运行」。

**3.4 端口统一 3701** —— 仓库默认值与本地 `.env` 长期两套说法，排查 502 时第一件事就是比对端口，统一到开发者熟悉的值。注意端口有**三处必须一致**：`.env` 的 `PORT`、Nginx 的 `proxy_pass`、健康检查（自动读 `.env`）。

**3.5 发布交给 GitHub Actions** —— 手工四步（构建/上传/重启/验证）容易漏步；CI 把它固化成可复现流程，还自动做发布前备份、健康检查与失败回滚。手工流程保留为兜底。

**3.6 依赖在服务器装** —— `better-sqlite3`、`argon2` 是原生模块，二进制绑定目标机 Node ABI 与 libc，跨机搬 `node_modules` 是「本地好、服务器崩」的经典来源。为省时间，`release.sh` 比对 `package-lock.json` 的 sha256（记在 `server/.deps-hash`），**仅依赖变化时重装**。

**3.7 私钥经 `env:` 传入** —— 内联进 `run:` 会破坏多行格式，OpenSSH 报 `error in libcrypto`（看起来像密钥坏了，实际是换行丢了）。凡含换行的 Secret 都照此处理。

**3.8 Nginx 配置不由 CI 覆盖** —— 它是公网入口，同机还托管其他站点；让自动化改入口，出错的代价是「所有站点不可访问」，收益只是省一次手工操作。改了配置要手工 `scp` + `nginx -t && systemctl reload nginx`。

**3.9 备份失败只警告、不阻断发布** —— 发布只覆盖 `dist`、不动数据库；若备份失败就禁止发版，会在线上故障急需发版时形成死锁。看到警告要人工补一次备份。

**3.10 发布包不含源码 / `.env` / `data/`** —— 代码、配置、数据是三类东西；把 `.env` 打进产物会让服务器配置被覆盖，把 `data/` 纳入同步可能用开发数据覆盖生产数据。物理隔离比「约定不要覆盖」可靠。

---

## 四、首次部署

前置：域名 A 记录指向 `<ECS_IP>`；安全组只放行 22 / 80；服务器已装 node 20 / pm2 / nginx / sqlite3 / gcc / make / python3。

```bash
# 1. 目录骨架
mkdir -p /var/www/weekly/{web,server,data,backup,deploy,releases}

# 2. 生产 .env（手工放一次，此后 CI 永不触碰）
cat > /var/www/weekly/.env <<'EOF'
PORT=3701
HOST=127.0.0.1
DB_PATH=data/weekly.db
NODE_ENV=production
SESSION_DAYS=30
MAX_WEEK=53
START_YEAR=2026
REGISTER_LIMIT_PER_HOUR=10
EOF
chmod 600 /var/www/weekly/.env
```

`.env` 三个要点：`PORT` 必须与 Nginx 的 `proxy_pass` 一致；`HOST` 保持 `127.0.0.1`（改成 `0.0.0.0` 会把 Node 暴露到公网）；`MAX_WEEK` / `START_YEAR` 不可改（分别是 53、2026）。完整变量说明见 `.env.example`。

```powershell
# 3. Nginx 站点配置（本地执行）
scp deploy/server_weekly.conf root@<ECS_IP>:/etc/nginx/conf.d/
ssh root@<ECS_IP> "nginx -t && systemctl reload nginx"

# 生效验证：这条必须有输出，否则说明配置没被加载
nginx -T 2>/dev/null | grep -A14 'server_name weekly.gouxinjie.com'

# 4. 部署密钥（本地执行）
ssh-keygen -t ed25519 -C "github-actions-weekly" -f "$HOME\.ssh\weekly_deploy"
$pub = Get-Content "$HOME\.ssh\weekly_deploy.pub"
ssh root@<ECS_IP> "mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo '$pub' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
ssh -i "$HOME\.ssh\weekly_deploy" root@<ECS_IP> "echo ok"      # 能打印 ok 即可
Get-Content "$HOME\.ssh\weekly_deploy" -Raw | Set-Clipboard     # 私钥待会儿粘进 GitHub

# 5. 首次发布
git push origin main
```

Nginx 配置**三个易错点**：`try_files $uri $uri/ /index.html` 必须写（否则刷新深层路由 404）；`proxy_pass` 端口必须等于 `.env` 的 `PORT`（否则 502）；`X-Real-IP` 必须透传（否则限流把所有用户算成一个 IP）。

GitHub Secrets（`Settings → Secrets and variables → Actions`）：

| Secret | 必填 | 说明 |
|---|---|---|
| `ECS_HOST` | 是 | ECS 公网 IP |
| `ECS_SSH_KEY` | 是 | 上一步的私钥全文（含 `BEGIN` / `END` 两行） |
| `ECS_USER` | 否 | 默认 `root`，**必须与持有 pm2 的用户一致** |
| `ECS_PORT` | 否 | 默认 `22` |
| `ECS_KNOWN_HOSTS` | 否 | 服务器 host key；不填则部署时现场 `ssh-keyscan` |

首次发布前**不要手动 `pm2 start`**——那时 `server/dist` 还不存在，进程会立刻退出并进入重启循环；`weekly` 进程由 `release.sh` 创建。首次发布也最慢，服务器上要下载并可能编译原生模块。

```bash
# 6. 开机自启（只需一次；systemctl status pm2-root 已 active 就说明早配过）
pm2 startup systemd        # 按提示执行它输出的那条 sudo 命令
pm2 save                   # 持久化进程列表

# 7. cron 定时备份
crontab -e                 # 加一行：0 3 * * * /var/www/weekly/deploy/backup.sh
bash /var/www/weekly/deploy/backup.sh   # 手动验一次，应产出 backup/weekly-YYYY-MM-DD.db
```

**验收清单**：`pm2 status` 中 `weekly` 为 `online`；`curl -s http://127.0.0.1:3701/api/health` 返回 `{"ok":true}`；`curl -sI http://weekly.gouxinjie.com` 返回 `200`；未登录访问 `/api/weekly/2026/38` 返回 `401`；浏览器注册后刷新登录态保持；刷新 `/weekly/2026/38` 不 404；`ss -lntp | grep 3701` 显示 `127.0.0.1:3701`（不是 `0.0.0.0`）。

---

## 五、日常发布与回滚

### 5.1 发布

```powershell
git push origin main
```

发布后看三点：Actions 两个 job 都绿（`[5/6] 健康检查` 应直接通过）；`pm2 status` 中 `weekly` 为 `online` 且**同机其他应用的 ↺ 次数不增长**；「验证线上可用性」打出的首页状态码与 `/api/health` 响应。

改了 Nginx 配置时（CI 不会自动覆盖）：

```powershell
scp deploy/server_weekly.conf root@<ECS_IP>:/etc/nginx/conf.d/
ssh root@<ECS_IP> "nginx -t && systemctl reload nginx"
```

一律 `reload` 而非 `restart`：`reload` 零停机、配置有语法错误时保留旧配置继续服务；`restart` 会瞬断，而这台 nginx 上还挂着其他站点。

### 5.2 `release.sh` 在服务器上做了什么

| # | 动作 | 要点 |
|---|---|---|
| 1 | 备份数据库 | 调 `deploy/backup.sh`；库不存在（首次）则跳过；失败只警告不中断 |
| 2 | 暂存旧产物 | `web/dist`、`server/dist` 移到 `.prev/` 供回滚 |
| 3 | 解包 | `tar -xzf <发布包> -C /var/www/weekly` |
| 4 | 生产依赖 | 仅当 `package-lock.json` 变化时 `npm ci --omit=dev` |
| 5 | 属主修正 | `chown` 到持有 pm2 的用户，保证 `data/` 可写 |
| 6 | pm2 重载 | `pm2 startOrReload <ecosystem> --update-env` |
| 7 | 健康检查 | 重试 30 次请求 `127.0.0.1:<PORT>/api/health`；失败则回滚 `.prev`、打印 `pm2 logs`、非 0 退出 |
| 8 | 持久化与清理 | `pm2 save`；`releases/` 只留最近 5 个 |

端口取自 `.env` 的 `PORT`，所以不会与后端实际监听脱节。

### 5.3 回滚

```bash
ls -1t /var/www/weekly/releases/      # 找上一个发布包
bash /var/www/weekly/deploy/release.sh \
  /var/www/weekly/releases/release-<旧短SHA>.tar.gz rollback
```

回滚的是**产物**，不回滚数据库——若本次发布含表结构迁移，数据要按第六章恢复备份。

---

## 六、备份与恢复

| 触发 | 命令 | 产出 |
|---|---|---|
| 每次发布前（自动） | `release.sh` 第 1 步 | `backup/weekly-YYYY-MM-DD.db` |
| 每日 3 点（cron） | `0 3 * * * /var/www/weekly/deploy/backup.sh` | 同上，当天重复执行会覆盖 |

备份由 `backup.cjs` 用 `VACUUM INTO` 生成一致性快照（理由见 3.2），保留 30 天；清理只认 `weekly-YYYY-MM-DD.db`，不会误删其他文件。**永远不要 `cp` 数据库文件**——WAL 模式下可能拿到不一致快照。

恢复：

```bash
pm2 stop weekly
cp /var/www/weekly/backup/weekly-<日期>.db /var/www/weekly/data/weekly.db
rm -f /var/www/weekly/data/weekly.db-wal /var/www/weekly/data/weekly.db-shm
pm2 start weekly
```

**必须删掉残留的 `-wal` / `-shm`**，否则新库会读到旧事务日志而损坏。配合 ECS 磁盘快照作为兜底。

---

## 七、排障速查

| 现象 | 原因 | 处理 |
|---|---|---|
| 域名 404（nginx 头） | `web/dist` 为空或 server 块未加载 | `nginx -T \| grep -A14 weekly.gouxinjie.com`；`ls /var/www/weekly/web/dist` |
| 命中别的站点 / nginx 默认页 | `server_name` 未生效、默认站点抢占 | 同上；检查其他站点的 `default_server` |
| 502 | 端口不一致或后端没在跑 | 两处都确认 3701；`pm2 logs weekly` |
| 刷新深层路由 404 | 少了 `try_files` | 补上并 `nginx -t && systemctl reload nginx` |
| 接口反复跳登录 | Cookie 没带上（`secure` 被误开） | 确认 `server/src/constants.ts` 里 `secure` 仍是注释状态 |
| 进程反复重启 | 启动即失败 | `pm2 logs weekly --lines 100`，对照 2.4 的失败表 |
| Actions 报「未找到 pm2」 | 非交互 shell 的 PATH 里没有 pm2 | 必要时 `ln -s "$(which pm2)" /usr/local/bin/pm2` |
| Actions SSH 认证失败 | Secrets 的私钥/用户不对 | 重配 `ECS_SSH_KEY`、`ECS_USER`（须为持有 pm2 的用户） |
| 发布前备份失败警告 | `node_modules` 缺失或磁盘满 | `ls /var/www/weekly/server/node_modules`；`df -h` |

排障顺序：`pm2 status weekly` → `pm2 logs weekly` → `nginx -t` → `tail -50 /var/log/nginx/weekly.error.log`。四步走完再动代码。

---

## 八、必须遵守的约束

1. **端口三处一致**：`.env` 的 `PORT`、Nginx 的 `proxy_pass`、健康检查（自动跟随 `.env`）
2. **不要在服务器上 `git pull` 跑源码**——上传的是构建产物，服务器没有 `src/`，也不装 devDependencies
3. **不要把 `.env`、`data/` 提交进仓库或打进发布包**
4. **不要开 3701 到公网**（Node 只在 `127.0.0.1` 后面）；**不要配 CORS**（同源）
5. **不要用 `nginx restart`**，一律 `reload`
6. **不要在服务器上改 `deploy/` 下的脚本**——每次发布都会被 CI 覆盖，要改就改仓库里的副本
7. **不要升级这台机器的 node**（多应用共用，升级会连带重启它们）
8. **不要手工 `pm2 start dist/index.js`**，也不要**在首次部署前**手动起进程——两条都会造出抢端口的野进程
9. **不要用 `pm2 update` / `pm2 kill` / `pm2 restart all`**——粒度是整个 daemon，会波及同机其他应用
10. **不要把服务器 IP、同机其他应用名写进仓库**——统一用占位符

**与同机其他应用共存**：它们共用同一个 pm2 daemon 与同一个 Nginx。`release.sh` 用的是进程级的 `startOrReload`，Nginx 侧只新增 `conf.d/server_weekly.conf` 并用 `reload`，因此互不影响；每次发布后扫一眼 `pm2 status`，确认其他应用的 ↺ 次数没增长。

---

## 附：常用命令

```bash
# 后端
pm2 status weekly
pm2 logs weekly --lines 100 --nostream
pm2 startOrReload /var/www/weekly/deploy/ecosystem.config.cjs --update-env

# Nginx
nginx -t && systemctl reload nginx
nginx -T 2>/dev/null | grep -A14 'server_name weekly.gouxinjie.com'
tail -f /var/log/nginx/weekly.error.log

# 数据库
sqlite3 /var/www/weekly/data/weekly.db ".tables"
sqlite3 /var/www/weekly/data/weekly.db "PRAGMA user_version;"
sqlite3 /var/www/weekly/data/weekly.db "PRAGMA journal_mode;"

# 备份 / 发布 / 回滚
bash /var/www/weekly/deploy/backup.sh
bash /var/www/weekly/deploy/release.sh /var/www/weekly/releases/release-<短SHA>.tar.gz <说明>
```
