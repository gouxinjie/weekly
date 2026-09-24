# weekly

以周为单位的工作记录工具。三个**互相独立**的模块，可以只用其中一个：

- **周报**　按 ISO 周组织，时间轴固定从 2025 年第 1 周开始。一周一篇，写多写少自己决定，不强制日更。
- **待办**　独立清单，条目可选标记所属周；标记到某一周的条目会出现在该周周报的右栏「本周待办」里。
- **便签**　纯文本碎片记录，多列便签墙，卡内直接编辑；不分组、不标周次，置顶优先、新的在前。

**多用户**：注册即用。每个账号的周报、待办、便签都按 `user_id` 完全隔离，互不可见。

部署形态：单台阿里云 ECS，Nginx 托管前端静态产物并把 `/api` 反代到内网的 Fastify 服务，数据落在 `data/weekly.db`。

---

## 截图

### 登录 / 注册

`/login`，登录与注册同页切换，未登录访问受保护路径会重定向到这里并带上原路径。

![登录页](screenshot/1-login.png)

### 工作台 · 周报

`/weekly/:year/:week`。左列是「年 > 月 > 周」三层时间轴（已写的周带绿色角标，未写的周为灰色但在树中依然可见），
中栏是当前周内容，右栏是标记到本周的待办。下面两张分别是展示态与编辑态。

![周报（选中 2026 年第 1 周）](screenshot/2-weekly.png)

![周报编辑态](screenshot/2-weekly-editor.png)

### 工作台 · 待办

`/todo`。单一清单 + 状态分组（置顶 / 未完成 / 已完成），左侧四选一筛选带计数：全部 / 本周 / 未完成 / 已完成。

![待办](screenshot/3-todo.png)

### 工作台 · 便签

`/notes`。等宽多列网格，按行排列、列数随窗口宽度自适应；三种便签纸色，点击卡片直接写，顶部搜索本地过滤。

![便签](screenshot/4-notes.png)

### 设置

`/settings`。外观主题（浅色 / 暖纸 / 深色）、修改密码、登出与退出所有设备、数据备份说明。

![设置](screenshot/5-settings.png)

---

## 技术栈

| | 选型 |
|---|---|
| 运行时 | Node.js 20 LTS + TypeScript |
| Web 框架 | Fastify |
| 数据库 | SQLite（`better-sqlite3`，WAL 模式）+ 手写 SQL |
| 密码与会话 | argon2 哈希；自建 token + `session` 表（HttpOnly + SameSite=Strict Cookie，30 天） |
| 日期处理 | dayjs + isoWeek 插件 |
| 构建工具 | Vite |
| 前端框架 | React 19 + React Router |
| 样式 | CSS Modules + SCSS，三套主题由 CSS 变量驱动 |
| Markdown | 编辑用 TipTap（所见即所得，底层仍存 Markdown），预览用 markdown-it |
| 数据请求 | 原生 fetch + 薄封装 |
| 包管理器 | npm |

刻意不引入：ORM、JWT、状态管理库、UI 组件库、Tailwind、axios / react-query。
手写 SQL 是为了让 `user_id` 条件一眼可见（见下方「设计约束」）。

---

## 目录结构

```
weekly/
├── server/                 # Fastify API 服务
│   ├── src/
│   │   ├── db/             # 所有 SQL 集中于此，便于审计 user_id
│   │   ├── routes/         # 路由层：只做参数校验与组装，不写 SQL
│   │   ├── middleware/     # 会话校验（注入 user_id）、登录 / 注册限流
│   │   ├── utils/          # 密码、令牌、响应封装
│   │   ├── constants.ts    # START_YEAR、周次上限等
│   │   └── index.ts
│   └── test/               # 跨用户访问测试（node --test）
├── web/                    # React SPA
│   └── src/
│       ├── pages/          # 5 条路由对应页面
│       ├── components/     # 组件与同名 .module.scss 成对出现
│       ├── api/            # fetch 薄封装
│       ├── utils/          # ISO 周次计算与格式化
│       └── styles/         # variables.scss 设计变量
├── deploy/                 # 部署材料（pm2 / Nginx / 备份脚本）
├── doc/weekly-PRD.md       # 需求文档
├── data/weekly.db          # SQLite 数据库文件
├── start.ps1               # Windows 开发环境一键启动
└── AGENTS.md               # 代码与数据库约束
```

---

## 本地运行

前置：Node.js 20 LTS 及以上（≥ 20.12，代码用到 `process.loadEnvFile`）、npm。

### 一键启动（Windows）

```powershell
.\start.ps1
```

脚本会依次检查 Node、按需从 `.env.example` 生成根目录 `.env`、在缺失时安装 `server/` 与 `web/` 的依赖，
然后开两个新窗口分别启动后端与前端。依赖已就绪时用 `.\start.ps1 -NoInstall` 跳过安装检查。

### 手动启动

```bash
# 终端 1：后端
cd server
npm install
npm run dev

# 终端 2：前端
cd web
npm install
npm run dev
```

- 前端固定跑在 <http://127.0.0.1:3700>，开发态把 `/api` 代理到后端，前后端同源，因此不需要 CORS。
- 后端端口由根目录 `.env` 的 `PORT` 决定（`.env.example` 默认 3701，与线上一致）。**改端口只需改这一处**，前端的代理目标会自动跟随。

### 测试

```bash
cd server
npm test
```

用 `node --test` 跑 `db/` 层的跨用户访问测试：拿 A 的会话去改 / 删 B 的记录 id，必须失败——这是本系统最严重的单点风险，不可省略。

---

## 环境变量

前后端共用根目录的 `.env`（已被 `.gitignore` 排除，不提交）。复制 `.env.example` 即可。

| 变量 | 说明 | 默认 |
|---|---|---|
| `PORT` | 后端监听端口，同时决定前端开发代理的转发目标 | `3701` |
| `HOST` | 监听地址，保持 `127.0.0.1`，改成 `0.0.0.0` 会让 Node 直接暴露公网 | `127.0.0.1` |
| `DB_PATH` | 数据库文件路径，相对路径以仓库根目录为基准 | `data/weekly.db` |
| `NODE_ENV` | 生产环境必须为 `production` | `development` |
| `SESSION_DAYS` | 会话有效期，必须与 `session` 表的 `expires_at` 保持一致 | `30` |
| `MAX_WEEK` | ISO 周次上限，不可改 | `53` |
| `START_YEAR` | 时间轴起点年份；以 CI 的 workflow env 为唯一来源，发布时自动同步到服务器 `.env` 并断言生效 | `2025` |
| `REGISTER_LIMIT_PER_HOUR` | 同 IP 每小时注册上限，防批量灌水 | `10` |

---

## 部署

`deploy/` 下是部署材料（`backup.cjs` 是 `backup.sh` 的实现，成对存在）：

| 文件 | 说明 |
|---|---|
| `ecosystem.config.cjs` | pm2 进程配置：`name=weekly`、`cwd=/var/www/weekly/server`、单实例 fork（SQLite 是单写者，不能开多实例）。由 `pm2 startOrReload` 加载 |
| `server_weekly.conf` | Nginx 站点配置，放到 `/etc/nginx/conf.d/server_weekly.conf`（Debian / Ubuntu 放 `sites-available/` 再软链）。托管 `web/dist` 并回退 SPA 路由，`/api` 反代到内网端口。必须透传 `X-Real-IP`，否则后端限流拿到的是 `127.0.0.1`，所有用户共用一个额度 |
| `release.sh` | 服务器端发布脚本：备份数据库 → 解包产物 → 按需 `npm ci --omit=dev` → `pm2 startOrReload` → 健康检查，失败自动回滚。CI 每次发布都会同步该脚本并调用 |
| `backup.sh` / `backup.cjs` | 一致性备份入口。`backup.sh` 探测 node 路径后调用 `backup.cjs`，由 better-sqlite3 执行 `VACUUM INTO`（**不用系统 sqlite3 CLI**：线上 3.26 不支持该语句），并清理超期备份。cron 与 `release.sh` 都走它 |

构建：

```bash
cd server && npm run build     # 产出 dist/，由 pm2 以 node dist/index.js 启动
cd web && npm run build        # 产出 web/dist/，由 Nginx 托管
```

### 自动部署（GitHub Actions）

`.github/workflows/deploy.yml`：推送 `main` 或手动触发后，CI 构建前后端产物 → 打包（只含 `web/dist`、`server/dist` 与两份 `package*.json`）→ scp 上传 → SSH 执行 `deploy/release.sh` → 从公网验证首页与 `/api/health`。

**服务器只需初始化一次**（机器上已有 Node 20 / pm2 / Nginx / sqlite3，只需建好 `/var/www/weekly` 目录并放上 `.env` 与 `server_weekly.conf`），之后所有发布由 CI 完成。CI 不传源码、不传 `node_modules`、不传 `.env`，也不改 Nginx 配置。

Node 版本刻意与这台 ECS 保持一致（**不升级 node**：该机器上的 node 由多个应用共用，升级会连带重启它们），CI 的构建版本随之为 20——详见 `AGENTS.md` §21.1。

**pm2 的开机自启只需配一次**（`release.sh` 每次发布会自动 `pm2 save`）：

```bash
systemctl status pm2-root --no-pager   # 已 active 说明这台机器早配过，跳过下面两步
pm2 startup systemd                    # 按提示执行它输出的那条 sudo 命令
pm2 save                               # 持久化进程列表（首次部署成功后再执行）
```

注意：`weekly` 进程由 CI 首次部署时自动创建（`release.sh` 里的 `pm2 startOrReload`）。**首次部署之前不要手动 `pm2 start`**——那时 `server/dist` 还不存在，进程会立刻退出并进入重启循环。

少了 `pm2 startup` + `pm2 save`，机器重启后服务不会自己起来。若 pm2 由 nvm 安装，自启单元里会写死当时的 node 路径，之后升级 node 需重跑这两条命令。

仓库需配置的 Secrets（`Settings → Secrets and variables → Actions`）：

| Secret | 必填 | 说明 |
|---|---|---|
| `ECS_HOST` | 是 | ECS 公网 IP（示例 `203.0.113.10`） |
| `ECS_SSH_KEY` | 是 | 部署私钥全文，**必须通过 `env:` 传入再写入文件**，直接内嵌 `run:` 会破坏多行格式 |
| `ECS_USER` | 否 | 默认 `root`，须与持有 pm2 进程的用户一致 |
| `ECS_PORT` | 否 | 默认 `22` |
| `ECS_KNOWN_HOSTS` | 否 | 服务器 host key；不填则部署时现场 `ssh-keyscan` |

---

## 设计约束

三条不可违反的红线，完整说明见 `AGENTS.md`：

1. **每一条 SQL 都带 `user_id`**，且 `user_id` 只能从服务端会话推导，绝不接受前端传入。所有 SQL 集中在 `server/src/db/`，写操作一律写成 `WHERE id = ? AND user_id = ?`，并用 `changes > 0` 判断是否真的改到了行。
2. **Markdown 渲染必须开启 HTML 转义**：markdown-it 固定 `html: false`，React 侧不使用 `dangerouslySetInnerHTML`。多用户环境下这是一条存储型 XSS 的防线。
3. **时间轴起点固定 2025、周次上限 53**，由服务端强制校验。两个容易踩的实现细节：起点校验要按「周」判定而不是按日期（2025 年第 1 周的周一落在 2024-12-30），周数上限是 53 而不是 52（写死 52 会丢掉每年的最后一周）。

---

## 文档

| 文件 | 说明 |
|---|---|
| `doc/weekly-PRD.md` | 产品需求文档，唯一事实来源 |
| `doc/weekly-deploy.md` | 部署手册：首次部署、日常发布、回滚、备份恢复、排障 |
| `AGENTS.md` | 代码规范、目录与命名约定、设计变量 |
| `ui.png` | 界面设计稿 |

---

## 开源协议

[MIT](LICENSE) © 2026 gouxinjie

可自由使用、修改、分发（含商用），只需保留版权与许可声明。
