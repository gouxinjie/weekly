# weekly — 部署运维文档

> **weekly**
> 版本 v1.0 | 2026-09-24
> 运行环境：阿里云 ECS | 部署方式：pm2 + Nginx + GitHub Actions

---

## 一、项目背景

### 1.1 项目简介

weekly 是一个**多用户**的周报管理工具，目标不是做一个简单的 Markdown 编辑器，而是把「一周一篇」的写作节奏，连同待办、便签两类碎片信息，沉淀到一条按 ISO 周次组织、起点固定 2025 年的时间轴上，长期可回顾。

功能上是三个彼此独立、共用一个账号体系的模块：**周报**（一周一篇 Markdown）、**待办**（独立清单，可选标记所属周次）、**便签**（Markdown 碎片，带可省标题，无完成态）。

所有数据按 `user_id` 隔离，且 `user_id` 只从服务端会话推导，不接受前端传入。

### 1.2 技术栈

| 层级 | 技术选型 |
|---|---|
| 前端框架 | React 19 + Vite + TypeScript |
| 样式 / Markdown | SCSS（CSS Modules）+ TipTap（编辑）+ markdown-it（预览，`html: false`） |
| 路由 / 请求 | React Router + 原生 fetch |
| 后端 | Node.js 20 + Fastify + TypeScript |
| 数据库 | SQLite（`better-sqlite3`，WAL 模式，单文件） |
| 鉴权 | argon2 哈希 + 自建 `session` 表（HttpOnly Cookie，同源） |
| 部署 | GitHub Actions + pm2 + 宿主 Nginx |

### 1.3 项目信息

| 条目 | 内容 |
|---|---|
| 源码仓库 | https://github.com/gouxinjie/weekly |
| 线上访问 | http://weekly.gouxinjie.com |
| ECS 部署路径 | `/var/www/weekly` |
| 进程数 | 1（pm2 进程 `weekly`，fork 单实例） |
| 后端端口 | `127.0.0.1:3701`（仅内网，不对外） |

> **两条前提约定**
>
> - 与文档或代码冲突时，以仓库里的 `deploy/` 脚本与 `.github/workflows/deploy.yml` 为准——脚本才是真正被执行的东西
> - **脱敏**：服务器 IP 记作 `<ECS_IP>`，同机其他应用统称「同机其他应用」；域名 `weekly.gouxinjie.com` 是产品的公开标识，予以保留

---

## 二、部署架构

### 2.1 网络拓扑

整体采用「宿主 Nginx 反代 + pm2 守护单进程」方式部署。ECS 的 80 端口由宿主 Nginx 统一监听，按 `server_name` 分流到不同业务；weekly 的前端是构建好的静态产物，由宿主 Nginx 直接读磁盘托管，后端 Node 进程只监听回环地址。

```
┌─────────────────────────────────────────────────────────────────────┐
│  外网用户                                                            │
│  http://weekly.gouxinjie.com                                        │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ :80
┌───────────────────────────▼─────────────────────────────────────────┐
│  阿里云 ECS 宿主机                                                   │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  宿主 Nginx（systemd 管理，master + worker）                    │  │
│  │                                                                │  │
│  │  server_name weekly.gouxinjie.com  ← /etc/nginx/conf.d/         │  │
│  │                                      server_weekly.conf         │  │
│  │        │                                                       │  │
│  │        ├─ location /      → root /var/www/weekly/web/dist       │  │
│  │        │                    （静态直读，try_files 回退 index.html）│  │
│  │        └─ location /api/  → proxy_pass http://127.0.0.1:3701    │  │
│  │                             （透传 X-Real-IP）                   │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  pm2 daemon（root 持有，与其他应用共用）                        │  │
│  │                                                                │  │
│  │  ┌─────────────────────────────────────────────────────────┐   │  │
│  │  │ weekly（fork 单实例）                                    │   │  │
│  │  │  node /var/www/weekly/server/dist/index.js              │   │  │
│  │  │  配置 /var/www/weekly/.env                              │   │  │
│  │  │  数据 /var/www/weekly/data/weekly.db（WAL）             │   │  │
│  │  └─────────────────────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

**请求链路总结：**

```text
浏览器 ──► ECS:80 (宿主 Nginx)
              │
              ├─ /          → /var/www/weekly/web/dist 下的静态文件（SPA，try_files 回退）
              │
              └─ /api/*     → 127.0.0.1:3701 (Node / Fastify)
                                  │
                                  ├─ 会话校验（Cookie → session 表）
                                  ├─ 业务 SQL（一律带 user_id）
                                  └─ SQLite /var/www/weekly/data/weekly.db
```

安全边界：Node 只监听 `127.0.0.1`，公网入口只有 Nginx 的 80；安全组只放行 **22 / 80**，**不放行** 3701。

### 2.2 端口规划

| 端口 | 归属 | 说明 |
|---|---|---|
| 80 | 宿主 Nginx | 对外唯一入口，按 `server_name` 分流多项目 |
| 3701 | weekly（Node） | 仅监听 `127.0.0.1`，供宿主 Nginx 反代；公网不可达 |

端口有**三个落点必须一致**：`/var/www/weekly/.env` 的 `PORT`、`server_weekly.conf` 的 `proxy_pass`、`release.sh` 的健康检查（自动读 `.env`，无需手改）。不一致的典型症状是 502。

### 2.3 进程与运行时

进程由 pm2 守护（`deploy/ecosystem.config.cjs`），关键字段：

```js
{ name: 'weekly', script: 'dist/index.js', cwd: '/var/www/weekly/server',
  instances: 1, exec_mode: 'fork', env: { NODE_ENV: 'production' },
  autorestart: true, max_restarts: 10, restart_delay: 3000, time: true }
```

| 字段 | 要点 |
|---|---|
| `name` | 进程名，`pm2 logs weekly` / `pm2 status weekly` 都用它 |
| `script` + `cwd` | 入口是编译产物 `dist/index.js`（相对 cwd），不是 `src/index.ts` |
| `instances: 1` + `fork` | SQLite 是单写者，多实例会互相锁库，**不可改** |
| `env.NODE_ENV` | 决定 Fastify 日志级别，且**优先于 `.env`** 里的同名项 |
| `max_restarts` / `restart_delay` | 连续失败 10 次后停止重试（间隔 3 秒），避免坏配置打满 CPU |

**服务端的两条链路：**

```
【部署链】源码 → 服务器上的文件
  server/src/*.ts
    └─ CI：npm ci && npm run build（tsc） → server/dist/*.js（CommonJS）
         └─ 打包（仅 dist + package*.json）→ scp → /var/www/weekly/releases/
              └─ release.sh 解包 → /var/www/weekly/server/dist
                   └─ 按需 npm ci --omit=dev → /var/www/weekly/server/node_modules

【启动链】服务器上的文件 → 对外可用的服务
  pm2 startOrReload deploy/ecosystem.config.cjs --update-env
    └─ node dist/index.js（cwd = /var/www/weekly/server）
         ├─ 1. 读配置      config.ts → /var/www/weekly/.env
         ├─ 2. 打开数据库  data/weekly.db（WAL + 外键约束）
         ├─ 3. 执行迁移    按 PRAGMA user_version 建表/升级
         ├─ 4. 注册路由    Fastify：cookie、/api/health、业务路由、错误处理
         └─ 5. 开始监听    listen(3701, 127.0.0.1)
```

两条链路的交界点是 **`server/dist`**：部署链更新它，启动链只认它。服务器上**没有 `src/`**，是刻意设计。启动任一环节失败都会让进程退出，pm2 会按 `restart_delay` 重试、超过 `max_restarts` 后停止——排查看 `pm2 logs weekly`。

**配置来源与优先级：**

```
① pm2 注入（ecosystem 的 env）  ← 最高
② /var/www/weekly/.env（config.ts 用 process.loadEnvFile 读取）
③ 代码内置兜底（PORT=3701、HOST=127.0.0.1、DB_PATH=data/weekly.db…）
```

`process.loadEnvFile` **不覆盖已存在的环境变量**，所以 pm2 注入的 `NODE_ENV=production` 永远赢过 `.env` 里的同名项——想改 `NODE_ENV` 得改 `ecosystem.config.cjs`。另外 `DB_PATH`、`.env` 这类路径由 `config.ts` 的 `ROOT_DIR = resolve(__dirname, '..', '..')` 推导（开发态从 `src/`、生产态从 `dist/` 上溯两级，都落在应用根目录），**因此不能把 `dist` 挪到别处**。

### 2.4 CI/CD 流水线

工作流文件 `.github/workflows/deploy.yml`，触发条件为 push `main` 或手动触发。CI 跑在 GitHub 的**临时虚拟机**上（用完即销毁，不持有任何项目数据），ECS 才是长期运行的工地：

| # | 阶段 | 操作 |
|---|---|---|
| 1 | 构建 | Runner 上 `npm ci` + 构建前端（Vite）与后端（tsc） |
| 2 | 打包 | `tar` 只装 `web/dist`、`server/dist`、两份 `package*.json` |
| 3 | 上传 | scp 发布包到 `releases/`，并同步 `deploy/` 下的脚本 |
| 4 | 准备 | `ssh mkdir -p` 确保目录存在（scp 不会自动建目录） |
| 5 | 发布 | ssh 执行【服务器上】的 `deploy/release.sh` |
| 6 | 校验 | 从公网验证首页与 `/api/health` |

**职责边界**：CI **不碰** `.env` 与 `data/`（发布包里没有它们）、**不装**生产依赖（`npm ci --omit=dev` 在服务器执行）、**不改** Nginx 配置、**不做**回滚（回滚逻辑在 `release.sh` 内部，CI 只把失败以非 0 退出码暴露出来）。划分原则是：与机器状态绑定的事（编译原生模块、改属主、重启本机进程、读写本机数据库）留给服务器，与机器无关的事（编译 TS、打包静态资源）放在 CI。

**安全性要点**：

- 部署私钥通过 GitHub Secrets 注入，只在运行时写入 runner 的临时文件（**必须经 `env:` 传入再 `printf` 落盘**，直接内联进 `run:` 会破坏多行格式，报 `error in libcrypto`）
- 服务器 `.env` 手工放置一次，不进仓库、不进发布包；CI 永不覆盖
- `concurrency: deploy-production` 保证同一时刻只跑一个发布；`deploy` 依赖 `build`，构建失败不会触碰服务器

---

## 三、部署中遇到的关键问题与解决

本章记录从方案设计到首次上线期间遇到的 10 个关键问题。它们的结论都固化在了 `deploy/` 脚本与配置里。

### 3.1 问题一：systemd 与 pm2 会抢同一个端口

**现象**：最初按通用做法准备了 systemd 单元（`weekly.service`），但目标 ECS 上已有多个应用由同一个 pm2 daemon 守护。

**排查**：两套进程管理器都会认为自己该拉起 `weekly`。结果不只是重复启动，而是抢 3701 端口（`EADDRINUSE`）；排障时也容易看错地方——`systemctl status` 正常，pm2 里却在疯狂重启。

**解决**：改用 pm2（`deploy/ecosystem.config.cjs`），`weekly.service` 从仓库删除。随之带来一个约束：pm2 daemon 由 **root** 持有，因此 CI 的 `ECS_USER` 必须是 root，否则 `pm2` 会去读另一个 `PM2_HOME`，把「进程已存在」误判为「首次部署」。开机自启依赖 `pm2 startup` + `pm2 save`。

### 3.2 问题二：备份语句在线上直接报语法错误

**现象**：原方案用 `sqlite3 data/weekly.db "VACUUM INTO '...'"` 做发布前备份，在服务器上执行报错。

**排查**：线上 `sqlite3` 是 **3.26.0（2018 年）**，而 `VACUUM INTO` 是 SQLite **3.27** 才引入的语句。`release.sh` 开着 `set -e`，这一行会让**首次部署直接中断**。

**解决**：备份改走 `deploy/backup.cjs`，用项目自带的 `better-sqlite3` 执行同一条 `VACUUM INTO`——它内置的 SQLite 较新，且与服务运行时同源，不受系统包版本影响。系统 `sqlite3` 只保留只读查询用途（`.tables`、`PRAGMA`）。

### 3.3 问题三：服务器 Node 版本与项目规范不一致

**现象**：项目规范写 Node 22 LTS，目标机器是 v20.20.2。

**排查**：该机的 node 被同机其他应用共用，全局升级会把它们一起重启（其中个别服务重启次数已偏高）。而 weekly 在 Node 20 上完全跑得动：`better-sqlite3@12` 要求 `20.x || 22.x || ...`、`argon2@0.45` 要求 `>=16.17`，代码里唯一有版本下限的 API 是 `process.loadEnvFile`（Node ≥ 20.12）。

**解决**：weekly 适配 Node 20——CI 的 `NODE_VERSION` 固定 `20`，`server/package.json` 声明 `engines.node >= 20.12.0`，文档与注释同步。避免出现「用 22 构建、用 20 运行」的隐性差异；将来同机统一升级时，weekly 改两行即可跟随。

### 3.4 问题四：本地与线上的端口是两套说法

**现象**：仓库默认值写着 3000，而本地 `.env` 用的是 3701，`start.ps1` 的注释也写 3701。

**排查**：端口本身不影响功能（前端调用相对路径 `/api`，同源，与端口无关）。但排查 502 时第一件事就是比对端口，若文档说 3000 而实际是 3701，会白白绕一圈。

**解决**：全仓库统一为 3701（代码兜底、`.env.example`、Nginx、健康检查、CI 构建用 `.env`、文档）。并要求端口在**三处**保持一致（见 2.2）。

### 3.5 问题五：手工发布的四步容易漏步

**现象**：原规范是「本地构建 → `rsync` 上传 → SSH 重启 → 验证」的手工流程。

**排查**：手工发布依赖本机环境（Node 版本、依赖是否装全），且四步里漏一步（忘了重启、忘了验证）在忙碌时很常见。

**解决**：改为 GitHub Actions 自动发布，把这四步固化成一次可复现执行，并在 `release.sh` 里自动做**发布前备份、健康检查、失败回滚**。手工流程保留为兜底。

### 3.6 问题六：node_modules 不能跨机器搬运

**现象**：直觉做法是把 CI 里 `npm ci` 出来的 `node_modules` 一起打包上传。

**排查**：`better-sqlite3`、`argon2` 是原生模块，其二进制与目标机器的 Node ABI、libc 版本绑定。跨机搬运是「本地好、服务器崩」的经典来源。

**解决**：发布包只含 `dist` 与两份 `package*.json`，服务器上执行 `npm ci --omit=dev`。为省时间，`release.sh` 比对 `package-lock.json` 的 sha256（记在 `server/.deps-hash`），**仅依赖变化时才重装**——日常发版几秒完成，改依赖的发布才慢几分钟。

### 3.7 问题七：私钥内联导致 `error in libcrypto`

**现象**：workflow 里最初写成 `echo "${{ secrets.ECS_SSH_KEY }}" > key`，SSH 报私钥无效。

**排查**：私钥是多行文本，直接内嵌进脚本会被 YAML 与 shell 的引号/换行处理破坏。报错信息是 `error in libcrypto`，听起来像密钥坏了，实际只是换行丢了。

**解决**：改为 `env:` 注入 + `printf '%s\n' "$SSH_PRIVATE_KEY" > "$HOME/.ssh/deploy_key"`。凡「内容含换行」的 Secret（证书、多行配置）都照此处理。

### 3.8 问题八：Nginx 配置加了却没生效

**现象**：站点配置放进 `/etc/nginx/conf.d/`、`nginx -t` 通过、`reload` 也成功了，但 `nginx -T | grep 'server_name weekly.gouxinjie.com'` **没有任何输出**，访问域名命中的是别的站点。

**排查**：`reload` 成功不代表配置被加载——最可能是文件不在 nginx 实际 include 的目录里（例如放到了其他路径），或者 `include` 指令被注释。`nginx -T` 打印的是**当前已加载**的配置，用它比对最快。

**解决**：确认文件落在 `/etc/nginx/conf.d/` 且主配置里 `include /etc/nginx/conf.d/*.conf` 生效，重新 `scp` 后 `nginx -t && systemctl reload nginx`，再用 `nginx -T | grep -A14 'server_name ...'` 验证。另外明确一条策略：**Nginx 配置不由 CI 覆盖**——它是公网入口且同机还有其他站点，让自动化改入口的出错代价（所有站点不可访问）远大于收益（省一次手工操作）。

### 3.9 问题九：备份失败就禁止发版会形成死锁

**现象**：备份被定位为「发布前必做」，直觉是失败即中止发布。

**排查**：发布只覆盖 `dist` 产物，**不动数据库**；而「备份链路因磁盘满或依赖缺失而失败」与「数据正面临风险」是两件事。若备份失败就禁止发版，会在线上故障急需发版时把自己锁死。

**解决**：`release.sh` 里备份失败只打印警告并继续，但日志明确标出「发布前备份失败」。真正需要严格把关的是**伴随表结构变更的发布**——那时必须先确认备份可用。

### 3.10 问题十：发布包带 `.env` / `data/` 会覆盖线上状态

**现象**：直觉是「把仓库同步到服务器」最省心。

**排查**：代码、配置、数据是三类东西。把 `.env` 打进产物会让服务器配置随发布被覆盖；把 `data/` 纳入同步范围可能用开发数据覆盖生产数据。

**解决**：发布包**只含** `web/dist`、`server/dist`、两份 `package*.json`；`.env` 与 `data/` 由 `.gitignore` 排除，只存在于服务器。物理隔离比「约定不要覆盖」可靠。

---

## 四、关键配置文件说明

### 4.1 `.github/workflows/deploy.yml`（CI 流水线）

**位置**：仓库根目录。

构建（`build`）与发布（`deploy`）两个 job，后者 `needs` 前者。构建阶段生成一份**只用于构建**的临时 `.env`（前端需要 `START_YEAR` / `MAX_WEEK` 注入常量），随后打包、上传 artifact；发布阶段配好 SSH、补目录、**校准服务器 `.env` 的时间轴配置**、scp、执行服务器脚本、公网验证。

**时间轴起点与周次上限由 workflow 顶层的 `env.START_YEAR` / `env.MAX_WEEK` 统一提供**（构建期与运行期同源）：构建阶段用它们生成前端 `.env`，发布阶段用同一个值把服务器 `.env` 的这两个键校准（幂等 sed，其余键不动；`.env` 不存在时只告警不改）。发布最后一步会断言 `/api/health` 的 `startYear` / `maxWeek` 与之一致，不一致直接判定发布失败——把「界面能打开某周、保存却报周次超出有效范围」这类最难排查的问题挡在流水线上。

### 4.2 `deploy/ecosystem.config.cjs`（pm2 进程定义）

**位置**：服务器 `/var/www/weekly/deploy/`。

定义唯一的进程 `weekly`：入口 `dist/index.js`、`cwd` 为 `server/`、fork 单实例、注入 `NODE_ENV=production`、崩溃自动重启。**启动与重载都必须通过这个文件**：

```bash
pm2 startOrReload /var/www/weekly/deploy/ecosystem.config.cjs --update-env
```

不要用 `pm2 start dist/index.js` 手工起进程——那会创建一个不带这些配置的野进程，与 CI 创建的进程抢同一个 3701 端口。

### 4.3 `deploy/release.sh`（服务器端发布脚本）

**位置**：服务器 `/var/www/weekly/deploy/`（每次发布由 CI 覆盖，**改要改仓库里的副本**）。

| # | 动作 | 要点 |
|---|---|---|
| 1 | 备份数据库 | 调 `deploy/backup.sh`；库不存在（首次）则跳过；失败只警告不中断 |
| 2 | 暂存旧产物 | `web/dist`、`server/dist` 移到 `.prev/` 供回滚 |
| 3 | 解包 | `tar -xzf <发布包> -C /var/www/weekly` |
| 4 | 生产依赖 | 仅当 `package-lock.json` 变化时 `npm ci --omit=dev` |
| 5 | 属主修正 | `chown` 到持有 pm2 的用户，保证 `data/` 可写 |
| 6 | pm2 重载 | `pm2 startOrReload <ecosystem> --update-env` |
| 7 | 健康检查 | 重试 30 次请求 `127.0.0.1:<PORT>/api/health`；失败则回滚 `.prev`、打印 `pm2 logs`、非 0 退出 |
| 8 | 持久化与清理 | `pm2 save`；`releases/` 只留最近 5 个发布包 |

### 4.4 `deploy/backup.sh` + `backup.cjs`（数据库备份）

`backup.sh` 是入口（探测 node 路径后调用 `backup.cjs`），真正的备份由 `backup.cjs` 用 `better-sqlite3` 执行 `VACUUM INTO` 完成——**不用系统 sqlite3**，理由见 3.2。

产出 `backup/weekly-YYYY-MM-DD.db`（每天一份，当天重复执行会覆盖），默认保留 30 天，可用 `KEEP_DAYS` 覆盖。**永远不要 `cp` 数据库文件**：WAL 模式下数据库由 `.db` + `-wal` 组成，直接复制可能拿到不一致快照。

### 4.5 `deploy/server_weekly.conf`（宿主 Nginx 站点配置）

**位置**：服务器 `/etc/nginx/conf.d/server_weekly.conf`（**不在 CI 覆盖范围内，需手工同步**）。

三条关键规则：

```nginx
location / { try_files $uri $uri/ /index.html; }     # SPA 回退，否则刷新深层路由 404
location /api/ {
    proxy_pass http://127.0.0.1:3701;                # 端口必须等于 .env 的 PORT
    proxy_set_header X-Real-IP $remote_addr;         # 必须透传，否则限流把所有用户算成一个 IP
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

同步方式：

```powershell
scp deploy/server_weekly.conf root@<ECS_IP>:/etc/nginx/conf.d/
ssh root@<ECS_IP> "nginx -t && systemctl reload nginx"
```

### 4.6 `.env`（生产环境变量）

**位置**：服务器 `/var/www/weekly/.env`，由 `.gitignore` 排除，手工放置一次，CI 永不覆盖。

```bash
PORT=3701                 # 必须与 Nginx 的 proxy_pass 一致
HOST=127.0.0.1            # 必须保持回环地址，改成 0.0.0.0 会把 Node 暴露到公网
DB_PATH=data/weekly.db    # 相对路径以 /var/www/weekly 为基准
NODE_ENV=production       # 决定日志级别（被 pm2 注入的同名项覆盖）
SESSION_DAYS=30           # 会话有效期，须与 session 表的 expires_at 一致
MAX_WEEK=53               # ISO 周次上限，不可改
START_YEAR=2025           # 时间轴起点年份
REGISTER_LIMIT_PER_HOUR=10
```

改完 `.env` 必须重启进程才生效：`pm2 startOrReload <ecosystem> --update-env`。

---

## 五、运维指南

### 5.1 日常命令

| 操作 | 命令 |
|---|---|
| 查看进程状态 | `pm2 status weekly` |
| 查看进程详情 | `pm2 describe weekly` |
| 看日志 | `pm2 logs weekly --lines 100 --nostream` |
| 重载服务 | `pm2 startOrReload /var/www/weekly/deploy/ecosystem.config.cjs --update-env` |
| 测试 Nginx 配置 | `nginx -t` |
| 重载 Nginx | `systemctl reload nginx` |
| 查看站点配置是否生效 | `nginx -T 2>/dev/null \| grep -A14 'server_name weekly.gouxinjie.com'` |
| Nginx 错误日志 | `tail -f /var/log/nginx/weekly.error.log` |
| 查看数据库表 | `sqlite3 /var/www/weekly/data/weekly.db ".tables"` |
| 查看迁移版本 | `sqlite3 /var/www/weekly/data/weekly.db "PRAGMA user_version;"` |
| 手动备份 | `bash /var/www/weekly/deploy/backup.sh` |

**注意**：`nginx` 一律用 `reload` 不用 `restart`（零停机，配置有误时保留旧配置继续服务）；**不要**用 `pm2 update` / `pm2 kill` / `pm2 restart all`（粒度是整个 daemon，会波及同机其他应用）。

### 5.2 发布与回滚

**日常发布**：`git push origin main`，其余全自动。发布后看三点——Actions 两个 job 都绿（`[5/6] 健康检查` 应直接通过）；`pm2 status` 中 `weekly` 为 `online` 且**同机其他应用的 ↺ 次数不增长**；「验证线上可用性」打出的首页状态码与 `/api/health` 响应。

**回滚**（产物层面）：

```bash
ls -1t /var/www/weekly/releases/      # 找上一个发布包
bash /var/www/weekly/deploy/release.sh \
  /var/www/weekly/releases/release-<旧短SHA>.tar.gz rollback
```

回滚的是产物，**不回滚数据库**。若本次发布含表结构迁移，数据要按 5.4 恢复备份。

### 5.3 健康检查验证

部署完成后依次验证：

```bash
# 1. 进程在线
pm2 status weekly

# 2. 后端自身可用（端口取自 .env 的 PORT）
curl -s http://127.0.0.1:3701/api/health
# => {"ok":true,"startYear":2025,"maxWeek":53}
#    注意比对 startYear：前端产物里的起点是构建期注入的，后端是运行期读服务器 .env，
#    两者不一致时界面能打开某周、保存却报「周次超出有效范围」（漏改服务器 .env 的典型症状）

# 3. 反代链路通
curl -sI http://weekly.gouxinjie.com
# => HTTP/1.1 200 OK

# 4. 鉴权在工作（未登录访问业务接口）
curl -s -o /dev/null -w '%{http_code}\n' http://weekly.gouxinjie.com/api/weekly/2026/38
# => 401

# 5. 只监听回环，公网不可达
ss -lntp | grep 3701
# => LISTEN 127.0.0.1:3701（不是 0.0.0.0）
```

浏览器侧再确认三项：注册后刷新登录态保持；刷新 `/weekly/2026/38` 这类深层路由不 404；写一条周报后刷新内容还在。

### 5.4 数据库备份与恢复

| 触发 | 命令 | 产出 |
|---|---|---|
| 每次发布前（自动） | `release.sh` 第 1 步 | `backup/weekly-YYYY-MM-DD.db` |
| 每日 3 点（cron） | `0 3 * * * /var/www/weekly/deploy/backup.sh` | 同上 |

恢复：

```bash
pm2 stop weekly
cp /var/www/weekly/backup/weekly-<日期>.db /var/www/weekly/data/weekly.db
rm -f /var/www/weekly/data/weekly.db-wal /var/www/weekly/data/weekly.db-shm
pm2 start weekly
```

**必须删掉残留的 `-wal` / `-shm`**，否则新库会读到旧事务日志而损坏。配合 ECS 磁盘快照作为兜底。

### 5.5 排障速查

| 现象 | 原因 | 处理 |
|---|---|---|
| 域名 404（nginx 头） | `web/dist` 为空或 server 块未加载 | `nginx -T \| grep -A14 weekly`；`ls /var/www/weekly/web/dist` |
| 命中别的站点 / 默认页 | `server_name` 未生效、默认站点抢占 | 见 3.8；检查其他站点的 `default_server` |
| 502 | 端口不一致或后端没在跑 | 两处都确认 3701；`pm2 logs weekly` |
| 刷新深层路由 404 | 少了 `try_files` | 补上并 `nginx -t && systemctl reload nginx` |
| 接口反复跳登录 | Cookie 没带上（`secure` 被误开） | 确认 `server/src/constants.ts` 里 `secure` 仍是注释状态 |
| 进程反复重启 | 启动即失败 | `pm2 logs weekly`；对照 2.3 的启动五步定位 |
| Actions 报「未找到 pm2」 | 非交互 shell 的 PATH 里没有 pm2 | 必要时 `ln -s "$(which pm2)" /usr/local/bin/pm2` |
| Actions SSH 认证失败 | Secrets 的私钥/用户不对 | 重配 `ECS_SSH_KEY`、`ECS_USER`（须为持有 pm2 的用户） |
| 发布前备份失败警告 | `node_modules` 缺失或磁盘满 | `ls /var/www/weekly/server/node_modules`；`df -h` |

排障顺序：`pm2 status weekly` → `pm2 logs weekly` → `nginx -t` → `tail -50 /var/log/nginx/weekly.error.log`。四步走完再动代码。

---

## 六、附录

### 6.1 首次部署 Checklist

**前置**：域名 A 记录指向 `<ECS_IP>`；安全组只放行 22 / 80；服务器已装 node 20 / pm2 / nginx / sqlite3 / gcc / make / python3（编译原生模块需要）。

```bash
# ① 目录骨架
mkdir -p /var/www/weekly/{web,server,data,backup,deploy,releases}

# ② 生产 .env（内容见 4.6）
cat > /var/www/weekly/.env <<'EOF'
PORT=3701
HOST=127.0.0.1
DB_PATH=data/weekly.db
NODE_ENV=production
SESSION_DAYS=30
MAX_WEEK=53
START_YEAR=2025
REGISTER_LIMIT_PER_HOUR=10
EOF
chmod 600 /var/www/weekly/.env
```

```powershell
# ③ 宿主 Nginx 站点配置（本地执行）
scp deploy/server_weekly.conf root@<ECS_IP>:/etc/nginx/conf.d/
ssh root@<ECS_IP> "nginx -t && systemctl reload nginx"

# ④ 部署密钥（本地执行）
ssh-keygen -t ed25519 -C "github-actions-weekly" -f "$HOME\.ssh\weekly_deploy"
$pub = Get-Content "$HOME\.ssh\weekly_deploy.pub"
ssh root@<ECS_IP> "mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo '$pub' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
ssh -i "$HOME\.ssh\weekly_deploy" root@<ECS_IP> "echo ok"      # 能打印 ok 即可
Get-Content "$HOME\.ssh\weekly_deploy" -Raw | Set-Clipboard     # 私钥待会儿粘进 GitHub

# ⑤ 首次发布
git push origin main
```

**GitHub Actions Secrets**（仓库 → Settings → Secrets and variables → Actions）：

| Secret | 必填 | 说明 |
|---|---|---|
| `ECS_HOST` | 是 | ECS 公网 IP |
| `ECS_SSH_KEY` | 是 | 上一步的私钥全文（含 `BEGIN` / `END` 两行） |
| `ECS_USER` | 否 | 默认 `root`，**必须与持有 pm2 的用户一致** |
| `ECS_PORT` | 否 | 默认 `22` |
| `ECS_KNOWN_HOSTS` | 否 | 服务器 host key；不填则部署时现场 `ssh-keyscan` |

首次发布前**不要手动 `pm2 start`**——那时 `server/dist` 还不存在，进程会立刻退出并进入重启循环；`weekly` 进程由 `release.sh` 创建。首次发布也最慢（服务器要下载并可能编译原生模块）。发布成功后：

```bash
# ⑥ 开机自启（只需一次；systemctl status pm2-root 已 active 就说明早配过）
pm2 startup systemd        # 按提示执行它输出的那条 sudo 命令
pm2 save                   # 持久化进程列表

# ⑦ cron 定时备份
crontab -e                 # 加一行：0 3 * * * /var/www/weekly/deploy/backup.sh
```

### 6.2 必须遵守的约束

1. **端口三处一致**：`.env` 的 `PORT`、Nginx 的 `proxy_pass`、健康检查（自动跟随 `.env`）
2. **不要在服务器上 `git pull` 跑源码**——上传的是构建产物，服务器没有 `src/`，也不装 devDependencies
3. **不要把 `.env`、`data/` 提交进仓库或打进发布包**
4. **不要开 3701 到公网**；**不要配 CORS**（前后端同源）
5. **不要用 `nginx restart`**，一律 `reload`
6. **不要在服务器上改 `deploy/` 下的脚本**——每次发布都会被 CI 覆盖，要改就改仓库里的副本
7. **不要升级这台机器的 node**——多应用共用，升级会连带重启它们（见 3.3）
8. **不要手工 `pm2 start dist/index.js`**，也不要在首次部署前手动起进程——两条都会造出抢端口的野进程
9. **不要用 `pm2 update` / `pm2 kill` / `pm2 restart all`**——粒度是整个 daemon，会波及同机其他应用
10. **不要把服务器 IP、同机其他应用名写进仓库**——统一用占位符
11. **时间轴起点以 CI 为唯一来源**：改起点只需改 `.github/workflows/deploy.yml` 顶层的 `START_YEAR`（构建期注入前端）+ `server/src/constants.ts` 的 `DEFAULT_START_YEAR`（新环境兜底），推送后发布流程会自动把服务器 `/var/www/weekly/.env` 校准为同一个值并断言生效；**不要**直接改服务器 `.env` 的这两个键——下次发布会覆盖回去

**与同机其他应用共存**：它们共用同一个 pm2 daemon 与同一个 Nginx。`release.sh` 用的是进程级的 `startOrReload`，Nginx 侧只新增 `conf.d/server_weekly.conf` 并用 `reload`，因此互不影响；每次发布后扫一眼 `pm2 status`，确认其他应用的 ↺ 次数没增长。

### 6.3 项目仓库结构

```
weekly/
├── .github/workflows/deploy.yml   # CI/CD 工作流
├── deploy/                        # 部署材料
│   ├── ecosystem.config.cjs       # pm2 进程配置
│   ├── release.sh                 # 服务器端发布脚本
│   ├── backup.sh / backup.cjs     # 一致性备份（VACUUM INTO）
│   └── server_weekly.conf         # 宿主 Nginx 站点配置
├── server/                        # 后端（Fastify + TypeScript）
│   ├── src/                       # db / routes / middleware / config.ts
│   └── test/isolation.test.ts     # 跨用户访问测试
├── web/                           # 前端（React + Vite）
│   └── src/                       # pages / components / api / styles
├── doc/weekly-PRD.md              # 需求文档
├── doc/weekly-deploy.md           # 本文
├── AGENTS.md                      # 开发约束（红线与规范）
└── README.md
```

### 6.4 服务器目录速查

```
/var/www/weekly/
├── .env                     # 生产配置，手工放置一次，CI 永不覆盖
├── deploy/                  # 部署脚本，每次发布由 CI 上传覆盖
├── releases/                # 发布包 release-<短SHA>.tar.gz，保留最近 5 个
├── data/weekly.db           # 数据库（唯一数据源，WAL）
├── backup/                  # 备份快照，保留 30 天
├── server/                  # dist/ + package.json + package-lock.json + node_modules（无 src/）
└── web/dist/                # 前端产物，由 Nginx 直接托管
```

> — 文档结束 —
