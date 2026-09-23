# AGENTS.md — weekly

本文档是本仓库的核心约束指南。所有生成的代码、注释、数据库设计必须遵循以下规则。

**注释必须使用中文。**

需求文档：`weekly-PRD.md`（唯一事实来源，与本文冲突时以 PRD 为准）

---

## 0. 不可违反的三条红线

**先读这一节。这三条一旦犯错，代价是真实用户的数据泄露或安全问题。**

### 红线 1：每一条 SQL 都必须带 `user_id`

这是**多用户系统**，不是单用户工具。所有读写都必须显式限定 `user_id`，且 `user_id` **只能从服务端会话推导，绝不能接受前端传入**。

```ts
// ❌ 错误：只按 id，知道别人的记录 id 就能改别人的数据
db.prepare('UPDATE todo SET text = ? WHERE id = ?').run(text, id);

// ✅ 正确：归属校验写在明面上
db.prepare('UPDATE todo SET text = ? WHERE id = ? AND user_id = ?')
  .run(text, id, session.userId);
```

**三道防线，缺一不可：**

1. 所有 SQL 集中在 `server/src/db/`，便于审计——**不要在路由层直接写 SQL**
2. 中间件统一校验会话并把 `user_id` 注入请求上下文
3. 写操作（UPDATE / DELETE）必须写成 `WHERE id = ? AND user_id = ?`

**唯一约束也是隔离的一部分**：`weekly` 表的约束是 `UNIQUE (user_id, year, week)`，不是 `UNIQUE (year, week)`。写成后者会导致第二个用户无法写同一周。

### 红线 2：Markdown 渲染必须开启 HTML 转义

`markdown-it` 默认会执行用户内容里的原始 HTML，**这是存储型 XSS**。多用户环境下一个人能攻击所有人。

```ts
import MarkdownIt from 'markdown-it';
const md = new MarkdownIt({ html: false });  // html 必须为 false
```

不要设 `html: true`，也不要为了支持内联 HTML 而关闭转义。React 侧同样**禁止使用 `dangerouslySetInnerHTML`** 渲染用户内容。

### 红线 3：时间轴起点固定 2026，服务端强制校验

起点是服务端常量 `START_YEAR = 2026`，**不可从用户注册时间推导**。

```ts
// 用户 A 2026 注册、用户 B 2027 注册
// ❌ 错误：按注册年推导，B 永远看不到 2026 年
const startYear = user.registeredAt.getFullYear();
// ✅ 正确：服务端常量
const START_YEAR = 2026;
```

服务端必须**拒绝**任何早于 2026 年第 1 周的写入，不能只靠前端不显示。

**⚠️ 这里有个真实的实现陷阱**（已用 Node 实测验证）：

| 事实 | 值 |
|---|---|
| 2026 年第 1 周的周一是 | **2025-12-29**（日期落在 2025 年！） |
| 2026 年总周数 | **53 周**（不是 52） |
| 2026-09-18 属于 | 2026 年第 38 周（09/14–09/20） |
| 2027-01-01 属于 | **2026 年第 53 周** |

**由此推出两条实现要求：**

1. **起点校验要按「周」而不是按「日期」**。用 `(year > 2026) || (year === 2026 && week >= 1)` 判断合法性，**不能**写成 `date >= '2026-01-01'`——后者会把合法的 2026 年第 1 周（2025-12-29 起）误判为越界。

2. **周次上限是 53，不是 52**。校验、循环、范围生成都要用 53。写死 52 会丢掉每年的最后一周。

---

## 1. 代码规范

### 1.1 类型安全

- 必须使用 TypeScript，前后端一致
- **禁止使用 `any`**（用 `unknown` + 类型收窄替代）
- 所有函数、变量、API 响应必须定义类型
- SQLite 的 row 类型与 session 对象必须显式建模

### 1.2 代码风格

- 遵循 ESLint（`@typescript-eslint/recommended` + `react-hooks` + `react/recommended`）
- **禁止使用 `eslint-disable`**（确实需要时需说明原因）
- React 使用**函数组件 + Hooks**，禁止 class component
- 统一使用 Prettier 格式化

### 1.3 路径规范

- **禁止使用 `../../` 相对引入**
- 统一使用 `@/` 路径别名
- 示例：`import Tree from '@/components/Tree';`

**配置位置**：`web/vite.config.ts` 的 `resolve.alias` + `web/tsconfig.json` 的 `paths`，两处必须一致。

### 1.4 代码清理

必须移除：未使用的变量、函数、import、样式。

### 1.5 中文注释（强制）

- **所有注释必须使用中文**
- 函数必须有 JSDoc 注释：功能说明、参数、返回值、异常
- 组件必须有头部注释（见 §4.2）

```ts
/**
 * 格式化周次显示
 * @param year - ISO 年
 * @param week - ISO 周次（1-53）
 * @returns 形如「2026 年第 38 周」的字符串
 */
export const formatWeekLabel = (year: number, week: number): string => {
  // 实现代码
};
```

---

## 2. 技术栈（已定，不要替换）

**代码组织：单仓双目录**，`server/` 与 `web/` 各自 `package.json`、各自构建。

```
weekly/
├── server/              # Fastify API 服务
│   └── src/
│       ├── db/          # 所有 SQL 集中于此
│       ├── routes/      # 路由层
│       ├── middleware/  # 会话校验、user_id 注入
│       └── index.ts
├── web/                 # React SPA
│   └── src/
│       ├── pages/       # 5 条路由对应页面
│       ├── components/  # 各组件附带同名 .module.scss
│       ├── styles/      # variables.scss 设计变量
│       └── api/         # fetch 薄封装
└── data/weekly.db
```

| 后端 | 选型 |
|---|---|
| 运行时 | Node.js 20 LTS + TypeScript（版本约束见 §21.1） |
| Web 框架 | Fastify |
| 数据库 | SQLite（`better-sqlite3`），WAL 模式 |
| 查询方式 | 手写 SQL + 薄封装 |
| 密码哈希 | argon2 |
| 会话 | 自建 token + `session` 表 |
| 日期处理 | dayjs + isoWeek 插件 |
| 包管理器 | **npm** |

| 前端 | 选型 |
|---|---|
| 构建工具 | Vite |
| 框架 | React 19 + TypeScript |
| 路由 | React Router |
| 样式 | **CSS Modules + SCSS** + 全局设计变量 |
| Markdown 编辑 | TipTap（所见即所得，底层仍存 Markdown） |
| Markdown 渲染 | markdown-it（**必须 `html: false`**，仅用于预览模式） |
| 数据请求 | 原生 fetch + 薄封装 |
| 状态管理 | `useState` + Context |
| 包管理器 | **npm** |

### 2.1 禁止引入的依赖

- **ORM**（Prisma / TypeORM / Drizzle）——手写 SQL 是刻意的，为了 `user_id` 条件可见
- **JWT**——用自建 session 表
- **状态管理库**（Redux / Zustand / Jotai）——用 `useState` + Context
- **UI 组件库**（Ant Design / MUI / shadcn）——手写样式
- **Tailwind**——用 CSS Modules
- **Next.js / Nuxt**——前后端分离
- **axios / react-query**——用原生 fetch

技术栈已定，不需要「更好的方案」。若认为某个决策需要推翻，**先问，不要直接换**。

**`better-sqlite3` 是同步原生绑定**——只能在 Node 运行时跑，不要尝试放到 Edge / Serverless 环境。

---

## 3. 目录与命名规范

### 3.1 web/src 目录结构

```
web/src/
├── pages/               # 页面（5 条路由）
│   ├── Login/
│   │   ├── index.tsx
│   │   └── index.module.scss
│   ├── Weekly/
│   ├── Todo/
│   ├── Notes/
│   └── Settings/
├── components/          # 组件（每个组件一个文件夹）
│   ├── Tree/
│   │   ├── index.tsx
│   │   └── index.module.scss
│   └── TodoList/
├── api/                 # fetch 薄封装，按模块拆分
│   ├── client.ts        # 基础请求封装
│   ├── weekly.ts
│   ├── todo.ts
│   └── note.ts
├── hooks/               # 自定义 Hooks
├── utils/               # 工具函数
│   ├── week.ts          # ISO 周次计算
│   └── format.ts
├── types/               # TypeScript 类型
│   ├── api.ts           # 接口出入参类型
│   └── models.ts        # 数据模型类型
├── constants/           # 常量（START_YEAR 等）
├── styles/              # 公共样式
│   ├── variables.scss   # 设计变量
│   └── global.scss      # 全局重置
└── assets/              # 静态资源
```

**与通用惯例的差异**：本项目的页面与组件统一用 `index.tsx` + `index.module.scss` 的文件夹结构，不用 `Tree.tsx` 平铺——这样组件与样式始终成对出现。

### 3.2 命名约定

- 组件文件、组件名：**大驼峰**（`TodoList`）
- 函数、变量：小驼峰
- 常量：全大写（`START_YEAR`）
- className：语义化，描述**角色**而非外观（`weekNode` 而非 `grayText`）
- 数据库表名、字段名：**蛇形**（`week_start`、`created_at`）

### 3.3 路由

产品名、目录名、库名、域名**统一为 `weekly`**，不要再出现 `week` / `weekly-manager` / `周报管理器` 等旧称。

| 页面 | 路径 |
|---|---|
| 登录 / 注册 | `/login` |
| 工作台（周报） | `/weekly/:year/:week` |
| 工作台（待办） | `/todo`（可带 `?year=&week=`，指定新建待办的默认归属周） |
| 工作台（便签） | `/notes` |
| 设置 | `/settings` |

未登录访问受保护路径 → 重定向 `/login` 并带上原路径。`/weekly/` 不带参数时补全为当前 ISO 年的当前周。

---

## 4. 组件规范

### 4.1 组件结构

每个组件由独立文件夹管理：

```
components/Tree/
├── index.tsx           # 组件实现
└── index.module.scss   # 组件样式
```

### 4.2 组件头部注释（强制）

每个组件文件必须包含头部注释：

```tsx
/**
 * @component 周次树
 * @description 左侧「年 > 月 > 周」三层导航树，支持折叠展开与状态角标
 * @author gouxinjie
 * @created 2026-09-18
 * @updated 2026-09-18
 */
```

### 4.3 Props 注释（强制）

必须定义 TS Interface 并写明每个属性的含义、类型、默认值、是否必填：

```tsx
interface TreeProps {
  /** 当前选中的年份 */
  year: number;
  /** 当前选中的周次（1-53） */
  week: number;
  /** 选中周变化时的回调 */
  onChange: (year: number, week: number) => void;
  /** 是否折叠右侧抽屉，默认 false */
  collapsed?: boolean;
}
```

### 4.4 React 规范

- 只用函数组件 + Hooks
- 列表必须给 `key`，**禁止用数组下标做 key**
- 大组件必须拆分
- 用 `useMemo` / `useCallback` 避免不必要的重渲染
- **禁止 `dangerouslySetInnerHTML`**（红线 2）
- 副作用必须写清依赖数组

---

## 5. 样式规范

### 5.1 主色调

**主色调：深墨绿 `#2e5245`**（`--color-accent`），取自 `ui.png` 设计稿。

颜色有明确分工，**不可混用**：

| 颜色 | 变量 | 用途 |
|---|---|---|
| 深墨绿 `#2e5245` | `--color-accent` | 主色：选中态（选中页签实底、周节点选中圆环）、主按钮、链接、聚焦环 |
| 反白 `#ffffff` | `--color-on-accent` | 主色实底上的前景：选中页签的文字与图标、主按钮文字（深色主题取 `#1b211e`） |
| 绿 `#4a8b3c` | `--color-saved` | 状态色：已写角标、已保存提示、本周进度条；小号文字改用 `--color-saved-strong`（`#3f7a33`，对比度更高），如时间轴月份已写计数 |
| 红 `#b03a2e` | `--color-danger` | 危险色：删除、错误提示 |
| 灰 `#9aa19d` | `--color-text-faint` | 未写状态：未写的周节点文字与角标 |

> 2026-09-22 更正：本节此前写的蓝色主色 `#2f6fb0` 与设计稿、与 `variables.scss` 实际值都不一致，现按代码实际值同步。

### 5.2 设计变量

全部定义在 `web/src/styles/variables.scss`：

```scss
:root {
  --color-bg:            #fefefd;
  --color-bg-subtle:     #f6f7f6;
  --color-bg-active:     #edf1ee;
  --color-text:          #22302b;
  --color-text-muted:    #6b7370;
  --color-text-faint:    #9aa19d;
  --color-border:        #e6e9e6;
  --color-border-strong: #d8ddd9;
  --color-accent:        #2e5245;
  --color-accent-hover:  #27463b;
  --color-accent-soft:   #e7efe9;
  --color-on-accent:     #ffffff;
  --color-saved:         #4a8b3c;
  --color-saved-strong:  #3f7a33;  /* 11-12px 小号状态绿 */
  --color-danger:        #b03a2e;
  --color-danger-hover:  #9b3227;
  --color-on-danger:     #ffffff;  /* 危险色实底上的前景 */

  /* 骨架尺寸，见 §6 */
  --rail-width:          200px;  /* 页签栏：logo + 页签 + 底部账号区 */
  --left-column-width:   220px;  /* 左列：周报态为时间轴，待办态为筛选 */
  --drawer-width:        220px;
  --center-min-width:    480px;
  --topbar-height:       56px;
  --settings-max-width:  760px;
  --note-column-width:   240px;  /* 便签态：便签墙的列宽（列数随宽度自适应） */
  --note-wall-max-width: 1200px; /* 便签态：便签墙的最大宽度 */

  /* 便签纸色：--note-bg-default / -yellow / -green，三种在每套主题里各定义一组 */
  --note-bg-default:     #ffffff;
  --note-bg-yellow:      #fdf5d9;
  --note-bg-green:       #e9f3e3;

  /* 登录页 */
  --login-card-width:    420px;
  --login-card-inset-x:  92px;

  --space-1: 4px;  --space-2: 8px;   --space-3: 12px;
  --space-4: 16px; --space-6: 24px;  --space-8: 32px;

  --radius-xs: 5px; --radius-sm: 6px;
  --radius-md: 10px; --radius-lg: 14px;

  --font-sans: system-ui, -apple-system, "Segoe UI", "PingFang SC",
               "Microsoft YaHei", sans-serif;
  --font-mono: "SF Mono", Consolas, "Courier New", monospace;
}
```

### 5.3 强制规则

- 所有颜色、尺寸、间距**取自变量**，不写魔法值
- 组件样式一律用 `.module.scss`，**不得污染全局**
- 样式文件必须有中文注释：文件说明、关键布局说明
- 骨架宽度只改 `variables.scss` 一处，组件里不得写死列宽
- 字体字号目前全项目统一直接写字面值，不纳入变量体系（如需调整请先统一约定）

### 5.4 主题机制

三套配色：`light`（默认）/ `paper`（暖纸护眼）/ `dark`（深色），切换入口在设置页「外观」卡片（G-13 的切换入口已实现）。

- 落地方式：`ThemeContext` 给根元素写 `data-theme`，`variables.scss` 里同名的 `[data-theme='xxx']` 块命中变量
- 亮色变量**同时**挂在 `:root` 与 `[data-theme='light']` 上——后者不能省：主题选择卡的缩略预览会局部挂 `data-theme` 借用该套配色，只写 `:root` 会让深色主题下的「浅色预览」继承成深色
- 覆盖块必须**写全用到的变量**，否则未声明的部分会继承父级主题，出现配色混杂
- 主题是纯本地偏好：只存 `localStorage`（键 `weekly:theme`），不进服务端、不随账号同步；多标签页靠 `storage` 事件联动（只改内存、不回写，否则互相触发）
- `index.html` 的首屏防闪脚本**不做取值白名单**，只排除默认的 `light`——非法值匹配不到任何变量块、视觉等同默认，因此新增主题不必改 HTML
- 新增主题要做三件事：`variables.scss` 加覆盖块、`constants/index.ts` 的 `THEMES` 加选项、`ThemeName` 联合类型加字面量
- 每套主题的状态色与分类色都要按 WCAG AA 校准（正文 / 状态 / 分类标签 ≥ 4.5:1），深色下 hover 必须比基色**更亮**

---

## 6. 界面骨架

登录后共有**三种骨架**，切换标签页即整体换骨架：

| 区域 | 周报态 | 待办态 | 便签态 |
|---|---|---|---|
| 页签栏 | 200px：logo + 页签 + 底部账号区 | 同左（宽度一致，位置不跳动） | 同左 |
| 左列 | 220px：`时间轴` 标题 + 年 / 月 / 周三层树 | 220px：`筛选` 标题 + 全部 / 本周 / 未完成 / 已完成（行尾计数） | **整列移除** |
| 中栏 | 自适应（最小 480px）：顶栏 + 标题栏 + 编辑区 + 工具条 | 自适应（最小 480px）：标题 + 搜索 + 新建输入框 + 分组清单 | 自适应（最小 480px）：标题 + 搜索 + 新建 + 多列瀑布流的便签卡片 |
| 右栏 | 「本周待办」220px，可收起 | **整栏移除**（不是收起） | **整栏移除** |

**关键规则**（容易做错）：

1. 页签栏宽度三态一致（200px），切换标签页时页签与账号区**不跳动**
2. 左列在周报态与待办态都在且同宽（220px），内容不同：周报态渲染时间轴树，待办态渲染筛选列表；两态都与中栏共享顶栏
3. 顶栏横跨「左列 + 中栏 + 右栏」，年份切换落在左列正上方，与 `时间轴` 标题左对齐（顶栏只属于周报态，待办态与便签态不传 `topbar`）
4. 待办态只有「页签栏 + 左列 + 中栏」，右栏整栏移除，中栏因此比周报态更宽
5. **便签态只有「页签栏 + 中栏」**：没有左列（便签不做筛选，只有顶部搜索）也没有右栏，中栏是三种骨架里最宽的
6. 窗口变窄时**优先压缩右栏**，其次才出现横向滚动
7. 页签在页签栏顶部，**整个应用没有顶部导航栏**
8. 登录页、设置页**不属于骨架体系**：分别是全屏悬浮卡片、单列居中布局

---

## 7. 后端规范

后端是**本项目风险最高的部分**——数据隔离、鉴权、限流、密码哈希全在这里。红线 1 与红线 3 的主战场就在这一节。

### 7.1 server/ 目录结构

```
server/
├── src/
│   ├── db/                    # 所有 SQL 集中于此，便于审计 user_id
│   │   ├── index.ts           # 连接初始化、WAL、migrate
│   │   ├── user.ts            # user 表读写
│   │   ├── session.ts         # session 表读写
│   │   ├── weekly.ts          # weekly 表读写
│   │   ├── todo.ts            # todo 表读写
│   │   ├── note.ts            # note 表读写
│   │   └── loginAttempt.ts    # 限流记录读写
│   ├── routes/                # 路由层：只做参数校验与组装，不写 SQL
│   │   ├── auth.ts            # 注册 / 登录 / 登出 / 改密
│   │   ├── weekly.ts
│   │   ├── todo.ts
│   │   └── note.ts
│   ├── middleware/
│   │   ├── session.ts         # 会话校验，注入 request.userId
│   │   └── rateLimit.ts       # 登录 / 注册限流
│   ├── types/
│   │   ├── models.ts          # 数据库 row 类型
│   │   └── api.ts             # 接口出入参类型
│   ├── constants.ts           # START_YEAR 等常量
│   └── index.ts               # Fastify 实例装配、路由注册
├── test/
│   └── isolation.test.ts      # 跨用户访问测试（node --test）
└── package.json
```

**分层铁律**：`routes/` **不允许出现 SQL**。所有 SQL 必须在 `db/`，这样才能一眼审计「每条查询带没带 `user_id`」。

### 7.2 数据库层规范

**连接初始化**：

```ts
import Database from 'better-sqlite3';

/** 数据库连接（单例，进程内共享） */
const db = new Database('data/weekly.db');
db.pragma('journal_mode = WAL');   // 开启 WAL，读写不互斥
db.pragma('foreign_keys = ON');    // 外键约束必须开启，否则 CASCADE 不生效
```

**⚠️ `foreign_keys` 默认是关闭的**，不显式开启会导致删除用户时其周报、待办、便签、会话不级联删除，变成孤儿数据。

**row 类型必须显式建模**：

```ts
/** weekly 表行类型 */
export interface WeeklyRow {
  id: number;
  user_id: number;
  year: number;        // ISO 年
  week: number;        // ISO 周次 1-53
  week_start: string;  // 该周周一，ISO 8601 日期
  week_end: string;    // 该周周日
  content: string;
  created_at: string;
  updated_at: string;
}
```

**db 层函数签名约定**：`userId` 必须是**第一个参数**，强制调用方传入。

```ts
/**
 * 查询指定周报
 * @param userId - 用户 ID，从会话推导，禁止来自前端
 * @param year - ISO 年
 * @param week - ISO 周次（1-53）
 * @returns 周报行，不存在时返回 undefined
 */
export const findWeekly = (
  userId: number, year: number, week: number,
): WeeklyRow | undefined => {
  return db.prepare(
    'SELECT * FROM weekly WHERE user_id = ? AND year = ? AND week = ?'
  ).get(userId, year, week) as WeeklyRow | undefined;
};
```

把 `userId` 放在第一位是刻意的——**想漏传都难**。

**写操作模板**（红线 1）：

```ts
/**
 * 更新周报内容
 * @param userId - 用户 ID，必须传入
 * @param id - 周报记录 ID
 * @param content - Markdown 内容
 * @returns 是否更新成功（false 表示记录不存在或不属于该用户）
 */
export const updateWeekly = (
  userId: number, id: number, content: string,
): boolean => {
  const r = db.prepare(
    `UPDATE weekly SET content = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`
  ).run(content, new Date().toISOString(), id, userId);
  return r.changes > 0;   // changes === 0 说明记录不属于该用户
};
```

**关键**：用 `r.changes` 判断是否真的改了行。返回 `changes > 0` 让「改别人的记录」在 API 层表现为失败，而不是静默成功。

### 7.3 鉴权与会话

**会话令牌生成**：

```ts
import { randomBytes } from 'node:crypto';

/** 生成会话令牌（256 位随机） */
export const createToken = (): string => randomBytes(32).toString('hex');
```

**用 `crypto.randomBytes`，禁用 `Math.random()`**——后者不是密码学安全随机数。

**会话校验中间件**必须做的事：

1. 从 Cookie 读 token
2. 查 `session` 表，校验存在且 `expires_at` 未过期
3. 把 `userId` 挂到请求上下文
4. 失败返回 401，**不区分「token 不存在」与「已过期」**

```ts
/** 校验会话并注入 userId；校验失败直接返回 401 */
export const requireAuth = async (request, reply) => {
  const token = request.cookies.session;
  if (!token) return reply.code(401).send(unauthorized());

  const sess = findSession(token);   // 内部已校验 expires_at
  if (!sess) return reply.code(401).send(unauthorized());

  request.userId = sess.user_id;     // 后续所有 db 调用从这里取
};
```

**路由层取 `userId` 只能从 `request.userId`**，**永远不要**从 query / body / header 读取用户 ID：

```ts
// ❌ 致命错误：攻击者改个参数就能读别人的数据
const userId = request.query.userId;
// ❌ 同样错误
const userId = request.body.user_id;
// ✅ 唯一正确来源
const userId = request.userId;
```

**过期会话清理**：登录时顺手删掉该用户的过期会话，不要引入定时任务。

**修改密码后**：删除该用户除当前会话外的所有 session（踢掉其他设备）。

**Cookie 配置规范**（统一在一处定义，不要散落）：

```ts
/** 会话 Cookie 配置 */
export const SESSION_COOKIE = {
  path: '/',
  httpOnly: true,        // 禁止 JS 读取，防 XSS 窃取
  sameSite: 'strict',    // CSRF 防护（本项目的方案，不用 CSRF token）
  maxAge: 30 * 24 * 60 * 60,  // 30 天，与 session.expires_at 保持一致
  // secure: true,       // ⚠️ 当前走 HTTP，设为 true 会导致 Cookie 不下发
} as const;
```

**三条要点：**

1. **`maxAge` 必须与 `session.expires_at` 一致**（都是 30 天）。不一致会出现「Cookie 还在但会话已过期」或反之
2. **`secure` 必须保持注释状态**——服务走 HTTP，开启后浏览器不会发送 Cookie，会导致登录态完全失效。将来启用 HTTPS 时**必须同步打开**（见 PRD §二 升级路径）
3. **不带 `domain`**——不显式设置时默认绑定当前域名，避免子域名间串用

### 7.4 密码处理

```ts
import argon2 from 'argon2';

/** 哈希密码 */
export const hashPassword = (plain: string): Promise<string> =>
  argon2.hash(plain);

/** 校验密码 */
export const verifyPassword = (hash: string, plain: string): Promise<boolean> =>
  argon2.verify(hash, plain);
```

**禁止存明文，禁止用 MD5 / SHA1 / SHA256 裸哈希**（这些是快哈希，不适合存密码）。

**密码强度校验必须服务端也做一遍**（前端校验只是体验，可被绕过）：

```ts
/**
 * 校验密码强度：必须同时含数字与字母，长度 ≥ PASSWORD_MIN_LENGTH（当前 6）
 * @param plain - 明文密码
 * @returns 是否通过
 */
export const isStrongPassword = (plain: string): boolean =>
  plain.length >= PASSWORD_MIN_LENGTH && /[0-9]/.test(plain) && /[a-zA-Z]/.test(plain);
```

### 7.5 限流

登录与注册接口都必须限流（HTTP 环境下这是防暴力破解的主要手段）。

**记录到 `login_attempt` 表**，同时按**手机号**和 **IP** 两个维度限流：

| 维度 | 阈值建议 | 目的 |
|---|---|---|
| 同手机号 | 15 分钟内失败 5 次 | 防针对单个账号的暴力破解 |
| 同 IP | 15 分钟内失败 20 次 | 防扫号（换手机号批量尝试） |

**注册接口另设独立阈值**（防批量灌水），且**注册成功也要计数**。

**限流检查必须在密码校验之前**，否则攻击者仍可通过响应时间差异探测。

### 7.6 输入校验

Fastify 内置 JSON Schema 校验，**每个路由都要写 schema**，不要手写 `if` 校验：

```ts
const loginSchema = {
  body: {
    type: 'object',
    required: ['phone', 'password'],
    properties: {
      phone:    { type: 'string', pattern: '^1[3-9]\\d{9}$' },  // 手机号
      password: { type: 'string', minLength: 1 },
    },
    additionalProperties: false,   // 拒绝多余字段
  },
};
```

**`additionalProperties: false` 必须加上**——否则前端传个 `user_id` 或 `id` 进来可能被误用。

### 7.7 周次与起点校验（红线 3）

```ts
/** 时间轴起点年份，不可修改 */
export const START_YEAR = 2026;

/** ISO 周次上限（一年最多 53 周） */
export const MAX_WEEK = 53;

/**
 * 校验 (year, week) 是否为合法的可写周次
 * @param year - ISO 年
 * @param week - ISO 周次
 * @returns 是否合法
 */
export const isValidWeek = (year: number, week: number): boolean => {
  if (!Number.isInteger(year) || !Number.isInteger(week)) return false;
  if (week < 1 || week > MAX_WEEK) return false;
  // ⚠️ 按「周」判断，不能按日期判断
  if (year < START_YEAR) return false;
  return true;
};
```

**不要写成 `new Date(...) >= '2026-01-01'`**——2026 年第 1 周的周一是 **2025-12-29**，按日期判断会误拒合法数据（详见红线 3）。

### 7.8 事务

跨表写操作必须用事务。`better-sqlite3` 是同步 API，用 `db.transaction` 包成函数：

```ts
/** 注册用户 + 创建会话（原子操作） */
export const registerUser = db.transaction((phone: string, hash: string) => {
  const userId = insertUser(phone, hash);
  createSession(userId);
  return userId;
});
```

**注意**：`db.transaction` 返回的是函数，调用时才执行；不要把异步函数放进去（`better-sqlite3` 事务是同步的）。

### 7.9 错误处理

- **所有路由必须有 try / catch**，异常统一转换为标准响应格式
- **错误日志不得包含密码、token**
- **不向前端泄露内部细节**：数据库错误统一返回「服务异常」，不要透出 SQL 或表名

```ts
// ❌ 泄露内部结构
reply.code(500).send({ message: err.message });  // "no such table: weekly"
// ✅
reply.code(500).send({ success: false, code: 'INTERNAL_ERROR',
                       message: '服务异常，请稍后重试', data: null });
```

### 7.10 数据库迁移

用 `PRAGMA user_version` 管理版本，启动时检查并执行迁移：

```ts
const version = db.pragma('user_version', { simple: true }) as number;
if (version < 1) {
  db.exec('CREATE TABLE user (...); CREATE TABLE weekly (...); ...');
  db.pragma('user_version = 1');
}
```

**已上线的表结构变更只能加迁移，不能直接改建表语句**——否则老库不会更新。

### 7.11 禁止事项

- **禁止在 `routes/` 里写 SQL**
- **禁止拼接 SQL 字符串**（一律参数化，`?` 占位符）
- **禁止从请求参数取 `userId`**
- **禁止用 `Math.random()` 生成令牌**
- **禁止跳过 `db.pragma('foreign_keys = ON')`**
- **禁止把 `argon2.verify` 的结果默认当真**（必须显式判断返回值）
- **禁止异步函数放进 `db.transaction`**
- **禁止在错误响应里透出 SQL、表名、堆栈**

---

## 8. 前后端接口约定

### 8.1 响应格式（统一）

成功：

```json
{ "success": true, "code": 200, "message": "操作成功", "data": {} }
```

失败：

```json
{ "success": false, "code": "ERROR_CODE", "message": "错误描述（中文）", "data": null }
```

前端必须处理 loading / error 两种状态，**不得假设接口结构**。

### 8.2 错误码

用语义化字符串码（如 `INVALID_CREDENTIALS`、`PHONE_EXISTS`、`WEEK_OUT_OF_RANGE`），不用纯数字。

**登录失败必须统一提示「手机号或密码错误」**，不区分「账号不存在」与「密码错误」——防手机号枚举。

### 8.3 请求封装

集中封装在 `web/src/api/client.ts`，业务接口按模块拆分（`weekly.ts` / `todo.ts` / `note.ts`）。每个接口函数必须有中文 JSDoc。

```ts
/**
 * 获取指定周报
 * @param year - ISO 年
 * @param week - ISO 周次（1-53）
 * @returns 周报内容；未写过时 content 为空字符串
 */
export const getWeekly = (year: number, week: number): Promise<Weekly> => {
  return request.get(`/api/weekly/${year}/${week}`);
};
```

---

## 9. 数据模型与周次计算

### 9.1 数据模型要点

字段细节见 PRD §三。以下是容易做错的约束：

- `weekly`：`UNIQUE (user_id, year, week)` —— **每人每周一篇**（不是 `UNIQUE (year, week)`）
- `todo`：`year` / `week` 可为 `NULL`；为 null 时不影响任何行为，不是「未分类」的特殊状态
- `note`（便签）：**没有任何唯一约束**（一人多张）；**没有 `done`**（便签无完成语义）；**没有 `year` / `week`**（不归属任何周次）；**没有 `sort_order`**（不做拖拽排序，列表固定按 `pinned DESC, id DESC` 即「置顶优先、新的在前」）。这三处「没有」是刻意与 `todo` 拉开距离，不要为了「将来可能用到」补上
- `note` 另有单用户 2000 张的数量上限（`constants.ts` 的 `NOTE_MAX_PER_USER`）：便签是唯一允许「空白即存在」的模块，创建成本最低，新建前必须 `countNotes` 校验，超过返回 400 `NOTE_LIMIT_REACHED`
- `session`：有效期 30 天，支持「登出所有设备」（清空该用户全部 session）
- 修改密码后**使其他会话失效**
- 时间存 ISO 8601 字符串
- 开 WAL 模式 + `foreign_keys = ON`
- 数据库表与字段要写中文注释

### 9.2 周次计算

**严格 ISO 8601，周一为一周起点**，跨年周按 ISO 年归属、一周不拆分。

用 `dayjs` 的 `isoWeek` 插件，**不要手写日历逻辑**：

```ts
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
dayjs.extend(isoWeek);

const y = dayjs(date).isoWeekYear();  // ISO 年（注意不是 year()）
const w = dayjs(date).isoWeek();      // ISO 周次 1-53
```

**易错点**：跨年周的 `isoWeekYear()` 与 `year()` 不同。2027-01-01 属于 2026 年第 53 周。取年份务必用 `isoWeekYear()`。

**前后端都要用同一套计算**——前端算树节点、后端做校验，结果必须一致。

---

## 10. 交互约定

- **自动保存**：输入停止 800ms 后落库，显示「保存中 / 已保存」
- **模板注入**：`content` 为空时注入一次模板（本周进展 / 遇到的问题 / 下周计划）；**用户清空后不再重复注入**
- **未写的周同样出现在树中**（不能只显示已写的周），未写为灰色、已写为绿色角标
- **错误反馈**：表单校验与保存失败**就地显示**；仅跨区域短反馈（导出成功、登出所有设备）用顶部 Toast
- **过期待办**：标记周次已过且未完成 → 该条挂**「过期」危险色小标签**（不染整行底色：`--color-bg-active` 是选中态专用色，拿它做过期提示会让整片补写的往期待办看着像被选中），**仅视觉，不推提醒**
- **待办清单按「所属周」分组**（手动标记的周优先，未标记按创建时间推导），周次由分组标题表达、行上不重复；行上只留「未标记」（不进周报「本周待办」）与「过期」两枚状态小标签
- **所属周只有一个来源**：`utils/week.ts` 的 `getTodoWeek()`。清单分组与左侧「本周」筛选都必须调它——两处各写一套判断，就会出现「这条在『本周』分组里，却不在『本周』筛选里」的自相矛盾
- **便签是纯文本**：卡内直接编辑（`textarea`），按普通文本渲染，**不走 Markdown 渲染器**；颜色只有 `NOTE_COLORS` 白名单里的三种，服务端 `enum` 兜底，出参再经 `normalizeNoteColor` 归一化（白名单收敛前的历史取值一律退回默认底色，否则那些便签会因 `enum` 校验而永远存不下）
- **便签自动保存**：同样是输入停止 800ms 落库，但**每张便签各有一套「保存中 / 已保存」**；离开便签页时把尚未落库的改动补发一次，不能丢掉最后几个字
- **空白便签**：本次会话新建、且从未写过内容的便签，失焦即丢弃（不在便签墙上留空白卡片）；本来就存在、后来被清空的便签保留为一张可继续写的空纸
- **便签不与周报 / 待办互转**：模块之间不做任何桥接，便签只进不出
- **多标签页**：仅检测并提示刷新，**不做 WebSocket 实时同步**
- **窄屏**：视口 < 1024px 时提示「请在桌面端使用」，不提供移动端布局

---

## 11. 安全要求（HTTP 环境下的底线）

服务走 HTTP，**凭据与内容均明文传输**。风险已知并接受，但补偿措施不可省略：

1. 密码 argon2 哈希存储，绝不存明文
2. 登录失败次数限制 + IP 限流
3. 注册接口加限流，防批量灌水
4. 会话 Cookie 设 `HttpOnly` + `SameSite=Strict`（**本项目的 CSRF 防护方案**，不引入 CSRF token）
5. 密码强制「数字 + 字母」组合，长度 ≥ 8 位（前后端与文档三处校验必须一致）
6. 接口不泄露用户是否存在
7. Node 仅监听内网端口，不直接暴露
8. **敏感信息一律走环境变量**，禁止硬编码任何密钥

**CSRF 说明**：本项目用 `SameSite=Strict` Cookie 作为 CSRF 防护，**不实现 CSRF token 双重提交**。原因：服务全程 HTTP，会话 Cookie 本身已是最薄弱环节，增加 token 机制不改变整体风险量级，反而增加实现复杂度。

---

## 12. 性能与状态

- **不用虚拟滚动**——预期 10 人以内、3 年内数据（约 150 周节点）
- 状态管理只用 `useState` + Context，**禁止引入状态管理库**
- 列表必须给 `key`，禁止用下标
- 大组件拆分
- 用 `useMemo` / `useCallback` 避免无效重渲染
- 状态命名必须语义化

---

## 13. 测试与验证

**不做**完整测试体系与 UI 测试。**只做**一件事：`db/` 层的跨用户访问测试（红线 1 的自动化保障），用 Node 内置 `node --test`，放在 `server/test/isolation.test.ts`。

**隔离测试必须覆盖的用例**（每条都要有）：

| 用例 | 预期 |
|---|---|
| A 读 B 的周报 | 查不到（返回 undefined） |
| A 改 B 的周报（拿 B 的 id） | `changes === 0`，API 层返回失败 |
| A 删 B 的待办 | 同上 |
| A 读 / 改 / 删 B 的便签 | 同上（读不到、改不动、删不掉） |
| A 的列表查询 | 只返回 A 自己的记录，不含 B 的 |
| 同一周次 A、B 各写一篇 | 两条记录共存，不冲突 |

**手工验证时优先覆盖这些边界**：

| 场景 | 预期 |
|---|---|
| 用户 A 和 B 都写 2026 年第 38 周 | 两人各自成功，互不冲突 |
| A 用 B 的 todo id 调删除接口 | 失败（不是静默成功） |
| A 用 B 的 note id 调删除 / 更新接口 | 失败（不是静默成功） |
| 便签颜色传白名单外的值（如 `red`） | 服务端拒绝（`enum` 校验） |
| 提交 2025 年第 52 周 | 服务端拒绝 |
| **提交 2026 年第 1 周（周一为 2025-12-29）** | **成功**——不能因日期在 2025 年而误拒 |
| **写入 2026 年第 53 周** | **成功**——2026 年有 53 周 |
| 2027-01-01 归属 | 2026 年第 53 周（`isoWeekYear` 边界） |
| 周报内容含 `<script>alert(1)</script>` | 预览区显示文本，不执行 |
| 连续 6 次输错密码 | 第 6 次被限流拒绝 |
| 登录接口传 `{ phone, password, user_id: 999 }` | 请求被拒（`additionalProperties: false`） |
| 请求体里塞 `id` 试图改别人记录 | 无效，`userId` 只从会话取 |

**部署后必须验证的项（每次发布都做）**：

| 检查 | 预期 |
|---|---|
| `pm2 status weekly` | `online`，重启次数不持续增长 |
| `curl -s http://127.0.0.1:3701/api/health` | 返回 `{"ok":true}` |
| 浏览器打开 `http://weekly.gouxinjie.com/login` | 登录页正常，**不是 Nginx 默认页** |
| 刷新 `/weekly/2026/38` 这类深层路由 | 不 404（`try_files` 生效） |
| 登录后点任意写操作 | 正常保存，Cookie 能带上（`secure` 没被误开） |
| `sqlite3 data/weekly.db "PRAGMA journal_mode;"` | 返回 `wal` |
| 服务器上 `ss -lntp \| grep 3701` | 监听 `127.0.0.1:3701`，**不是** `0.0.0.0:3701` |
| 从公网直连 3701 端口 | **连不上**（只走 Nginx） |

---

## 14. AI 行为约束（核心）

必须遵守：

1. **不允许编造接口**——接口不明确时先问
2. **不允许假设数据库结构**——以 PRD 与 `server/src/db/` 为准
3. **不允许跳过鉴权**
4. **不允许省略错误处理**
5. **不允许生成未使用代码**
6. **不允许修改无关文件**
7. **不明确需求必须询问**
8. **不允许为通过检查而使用 `eslint-disable` 或 `any`**

---

## 15. 开发工作流（必须执行）

### 15.1 新功能开发（前端）

1. 分析需求
2. 确认接口（不明确必须询问）
3. 定义 TypeScript 类型
4. 编写组件结构
5. 编写样式
6. 接入 API
7. 添加错误处理（loading / error 两态都要）
8. 自检是否符合本文档

### 15.2 新功能开发（后端）

顺序固定：**db 层 → 路由层 → 联调**。

1. 分析需求，确认数据模型变化
2. 若涉及表结构变更 → 先写迁移并更新 `PRAGMA user_version`
3. 定义 row 类型与出入参类型（`types/models.ts`、`types/api.ts`）
4. **写 `db/` 层函数**——`userId` 作为第一个参数，SQL 带完整 `user_id` 条件
5. 写路由 + JSON Schema（含 `additionalProperties: false`）
6. 需鉴权的接口挂 `requireAuth` 中间件
7. 登录 / 注册接口接限流
8. 补 `db/` 层隔离测试用例
9. 自检是否符合本文档（重点走 §17 后端专项 9~17 项）

### 15.3 修改代码

1. 先读原代码
2. 理解业务逻辑
3. 给出修改方案
4. 再进行修改

**禁止直接改代码而不分析。** 改动必须说明变更点。

### 15.4 Debug

1. 分析报错
2. 定位问题
3. 找到根因
4. 提供修复方案

---

## 16. 输出规范（强制）

1. 必须输出**完整代码**，含全部 import
2. 必须使用代码块，**禁止伪代码**
3. 必须有中文注释
4. 修改代码必须说明变更点
5. React 单文件组件内部顺序：`import` → 类型定义 → 组件主体 → 导出

---

## 17. 自检机制（输出前必须执行）

输出前逐项检查，不符合必须自动修正：

**通用**

1. 是否使用 TypeScript 且**无 `any`**
2. 是否有错误处理
3. 是否符合目录结构
4. 是否有未使用代码
5. 是否符合 ESLint 规范（未使用 `eslint-disable`）
6. 是否有中文注释（函数 JSDoc、组件头注释）
7. 是否使用 `@/` 路径而非 `../../`
8. **`@author` 是否为 gouxinjie**

**后端专项**

9. **涉及 SQL 的改动，是否每条都带 `user_id`**（红线 1）
10. **`userId` 是否只来自 `request.userId`**，有无从 query / body / header 读取
11. 写操作是否用了 `WHERE id = ? AND user_id = ?`，并用 `r.changes` 判断结果
12. 是否有 SQL 出现在 `routes/` 目录
13. 是否全部用参数化查询（无字符串拼接 SQL）
14. 路由是否都写了 JSON Schema 且带 `additionalProperties: false`
15. 登录 / 注册路由是否都接了限流
16. 错误响应是否泄露了 SQL、表名或堆栈
17. 新增表或字段时，是否加了迁移且更新了 `PRAGMA user_version`

**前端专项**

18. **是否出现 `dangerouslySetInnerHTML` 或 `html: true`**（红线 2）
19. 是否只在 `web/src/styles/variables.scss` 里定义颜色尺寸，组件内无魔法值
20. 列表 `key` 是否用了业务 ID（非数组下标）
21. 是否引入被禁止的依赖（状态管理库 / UI 库 / axios / ORM / JWT）

**配置与部署专项**

22. 新增配置项是否走 `config.ts`，有无散落的 `process.env.XXX`
23. 有无硬编码密钥、密码、URL
24. `.env` 是否在 `.gitignore` 中，`.env.example` 是否同步更新
25. 是否有代码把 `HOST` 设成 `0.0.0.0` 或让 Node 直接暴露公网
26. 是否误开了 Cookie 的 `secure`（HTTP 下会失效）或 `SESSION_COOKIE.maxAge` 与会话有效期不一致

---

## 18. 文档约定

`weekly-PRD.md` 是唯一事实来源。修改它时：

- **只写当前状态**，不留版本号（不出现「v0.x」）、不写变更记录
- **只写选了什么**，不写「为什么没选别的」（不写选型论证、替代方案对比）
- **不写 SQL schema**（属编码阶段产物），但实现约束（唯一约束、隔离规则、周次计算）必须留在正文
- 判断标准：**这段内容删掉后，开发时会不会做错事？** 会 → 保留；只是解释「当初为什么这么决定」→ 删除

改了 PRD 的决策后，**必须同时更新四个位置**：需求表、章节正文、决策记录、MVP 边界。只改一处会导致文档自相矛盾。

**PRD 完整性自查**（大改后执行）：

1. **口径一致** —— 同一决策在需求表 / 正文 / 决策记录 / MVP 四处口径相同
2. **编号连续** —— `^\| (R|M|G|Q)-` 拉出全部编号，检查断号（编号断档的需求等于没写）
3. **双向映射** —— 界面元素清单 ↔ 需求表互相可查：每个界面元素有需求支撑？每条需求有界面落点？

---

## 19. 常用命令

```bash
# 依赖安装（统一用 npm）
npm install

# server/
cd server
npm run dev          # 开发服务
npm run build        # 编译 TypeScript
node --test          # 跑 db 层测试

# web/
cd web
npm run dev          # Vite 开发服务器
npm run build        # 构建静态产物到 dist/
npm run lint         # ESLint 检查

# 数据库调试
sqlite3 data/weekly.db ".tables"                    # 列出所有表
sqlite3 data/weekly.db "SELECT * FROM user;"        # 查看用户
sqlite3 data/weekly.db "PRAGMA user_version;"       # 查看迁移版本
sqlite3 data/weekly.db "PRAGMA journal_mode;"       # 应返回 wal

# 数据备份（生产）：统一走部署脚本，内部由 better-sqlite3 执行 VACUUM INTO
bash /var/www/weekly/deploy/backup.sh
```

**部署相关命令（在服务器上执行）**

```bash
# 首次部署
sudo mkdir -p /var/www/weekly/{web,server,data,backup,deploy,releases}
# pm2 由哪个用户持有，/var/www/weekly 下的文件就归谁（release.sh 会按执行用户 chown）

# 发布
pm2 startOrReload /var/www/weekly/deploy/ecosystem.config.cjs --update-env
pm2 save                        # 持久化进程列表，供 pm2 startup 的开机自启读取
pm2 status weekly

# 看日志（排查 502 必用）
pm2 logs weekly --lines 100 --nostream
pm2 logs weekly

# Nginx
sudo nginx -t                  # 改配置后必须先测语法
sudo systemctl reload nginx
sudo tail -f /var/log/nginx/weekly.error.log

# 健康检查（在服务器本机执行）
curl -s http://127.0.0.1:3701/api/health
curl -sI http://weekly.gouxinjie.com
```

**排障顺序**：`pm2 status weekly` 看进程活没活 → `pm2 logs weekly` 看 Node 报错 → `nginx -t` 看配置 → 查 `/var/log/nginx/weekly.error.log` 看 502/504。四步走完再动代码。

---

**关于数据文件**

`data/weekly.db` 是**唯一数据源**，不要在它之外另建数据库文件。备份即复制该文件。

**备份必须在服务运行时用 `VACUUM INTO`**，不要直接 `cp`（WAL 模式下直接复制可能拿到不一致的快照）。

---

## 20. 环境变量与配置

### 20.1 变量清单

所有配置集中在**根目录 `.env`**，两端各自读取。**禁止硬编码任何密钥。**

| 变量 | 用于 | 默认 | 说明 |
|---|---|---|---|
| `PORT` | server | `3701` | 服务端口，仅监听内网 |
| `HOST` | server | `127.0.0.1` | **不要设 `0.0.0.0`**，只监听本机由 Nginx 转发 |
| `DB_PATH` | server | `data/weekly.db` | 数据库文件路径 |
| `NODE_ENV` | 两端 | `development` | 生产环境必须为 `production` |
| `SESSION_DAYS` | server | `30` | 会话有效期（天） |
| `MAX_WEEK` | 两端 | `53` | ISO 周次上限 |
| `START_YEAR` | 两端 | `2026` | 时间轴起点，**不可改** |
| `REGISTER_LIMIT_PER_HOUR` | server | `10` | 同 IP 每小时注册上限 |

**本项目没有 `SESSION_SECRET`**——会话不签名（不是 JWT），是随机 token 存表查库，因此不需要密钥。

### 20.2 文件约定

- `.env` **必须加入 `.gitignore`**，绝不提交
- 仓库里只提交 `.env.example`（含全部变量名 + 占位值 + 注释）
- 变量读取集中在 `server/src/config.ts`，**不要在业务代码里到处 `process.env.XXX`**
- 缺失必需变量时**启动即报错退出**，不要用静默默认值

```ts
/** 服务配置（启动时一次性读取并校验） */
export const config = {
  port: Number(process.env.PORT ?? 3701),
  host: process.env.HOST ?? '127.0.0.1',   // 只监听本机
  dbPath: process.env.DB_PATH ?? 'data/weekly.db',
  sessionDays: Number(process.env.SESSION_DAYS ?? 30),
} as const;
```

### 20.3 本地开发

开发时前端跑 Vite（3700）、后端跑 Fastify（3701），需要在 `vite.config.ts` 配置代理把 `/api` 转发到后端，避免跨域：

```ts
// vite.config.ts
server: {
  proxy: {
    '/api': { target: 'http://127.0.0.1:3701', changeOrigin: true },
  },
},
```

**正因为走 Vite 代理，前后端同源，所以不需要配置 CORS**。生产环境由 Nginx 承担同样的转发职责。**不要引入 CORS 中间件**——引入说明架构理解有误。

---

## 21. 部署规范

部署环境：阿里云 ECS + Nginx + pm2。域名 `weekly.gouxinjie.com`，HTTP。

> 逐步操作手册见 `doc/weekly-deploy.md`（首次部署、日常发布、回滚、备份恢复、排障）；本节记录的是**不可违反的约束与原理**。

### 21.1 部署拓扑

```
浏览器 ──HTTP──> Nginx（80 端口，公网）
                    ├── /            → 托管 web/dist 静态产物
                    └── /api/*       → 反代到 127.0.0.1:3701（Node）
```

**Node 只监听 `127.0.0.1`**，不直接暴露公网。安全组只开放 80（以及 22）。

**Node 版本约束（重要）**：这台 ECS 上的 node 由同机多个其他应用共用（当前 v20.20.2），**不要为了 weekly 单独升级 node**——升级会连带重启它们。CI 的 `NODE_VERSION` 必须与线上一致（20），否则会出现「用 22 构建、用 20 运行」的隐性差异。决策来龙去脉见 `doc/weekly-deploy.md` §2.3。

weekly 的依赖都支持 Node 20：`better-sqlite3@12` 要求 `20.x || 22.x || ...`、`argon2@0.45` 要求 `>= 16.17`；代码里唯一有下限的 API 是 `config.ts` 的 `process.loadEnvFile`（Node ≥ 20.12）。`server/package.json` 的 `engines.node` 已声明 `>=20.12.0`。

### 21.2 Nginx 配置要点

```nginx
server {
    listen 80;
    server_name weekly.gouxinjie.com;

    # 前端静态产物
    root /var/www/weekly/web/dist;
    index index.html;

    # SPA 路由回退：5 条路由都是前端路由，刷新不能 404
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API 反代
    location /api/ {
        proxy_pass http://127.0.0.1:3701;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;      # 限流需要真实 IP
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

**三个易错点：**

1. **`try_files ... /index.html` 必须写**——否则用户刷新 `/todo` 会 404（服务器上不存在这个文件）
2. **`X-Real-IP` 必须透传**——否则后端限流拿到的是 Nginx 的 IP（127.0.0.1），所有用户共用一个限流额度，限流形同虚设
3. **改 `server_name` 前先确认 DNS 已解析**——否则改了 Nginx 但域名指向旧 IP，访问直接失败

### 21.3 pm2 进程管理

```js
// /var/www/weekly/deploy/ecosystem.config.cjs
module.exports = {
  apps: [{
    name: 'weekly',
    script: 'dist/index.js',
    cwd: '/var/www/weekly/server',
    instances: 1,                 // SQLite 是单写者，只能单实例
    exec_mode: 'fork',
    env: { NODE_ENV: 'production' },
    autorestart: true,
    max_restarts: 10,
    restart_delay: 3000,
  }],
};
```

**四个要点：**

1. **`cwd` 固定为 `server/`**，与线上目录结构一致（`DB_PATH` 是相对路径，但 `config.ts` 用 `dist/../..` 推导到 `/var/www/weekly`，因此与 cwd 无关，不要试图靠 cwd 改数据库位置）
2. **环境变量不在 pm2 里集中维护**：`config.ts` 会自行读取 `/var/www/weekly/.env`，配置只写 `NODE_ENV`
3. **`instances: 1` 不可改**——SQLite 单写者，多实例会互相锁库；因此 `reload` 等价于重启，发布有约 1 秒不可用
4. **发布统一走 `pm2 startOrReload <配置文件> --update-env`**：进程不存在则创建、已存在则重载，首次部署与后续发布共用一条命令

常用命令：

```bash
pm2 status weekly                                              # 进程状态与重启次数
pm2 logs weekly                                                # 看实时日志
pm2 startOrReload /var/www/weekly/deploy/ecosystem.config.cjs --update-env
pm2 save                                                       # 持久化进程列表，开机自启读它
pm2 startup systemd                                            # 生成开机自启单元，只需执行一次
```

**⚠️ 开机自启**：`pm2 startup` 只做一次，且**必须紧跟 `pm2 save`**；少了它，机器重启后服务不会自己起来。若 pm2 由 nvm 安装，自启单元里会写死当时的 node 路径，升级 node 后要重跑这两条命令。

### 21.4 发布流程

```bash
# 1. 本地构建
cd web && npm run build           # 产物 web/dist
cd ../server && npm run build     # 产物 server/dist

# 2. 上传产物（不传源码、不传 node_modules、不传 .env）
rsync -av --delete web/dist/  server:/var/www/weekly/web/dist/
rsync -av --delete server/dist/ server:/var/www/weekly/server/dist/

# 3. 服务器上安装生产依赖（仅首次或依赖变更时）
ssh server "cd /var/www/weekly/server && npm ci --omit=dev"

# 4. 重载服务（CI 中由 deploy/release.sh 完成这几步）
ssh server "pm2 startOrReload /var/www/weekly/deploy/ecosystem.config.cjs --update-env && pm2 save"

# 5. 验证
curl -I http://weekly.gouxinjie.com          # 应返回 200
curl http://weekly.gouxinjie.com/api/health  # 应返回 JSON
```

**发布前必做**：备份数据库——`release.sh` 会自动调用 `deploy/backup.sh` 完成（见 §19）；若日志里出现「发布前备份失败」的警告，必须人工补一次。

**发布顺序注意**：如果这次改动包含**表结构变更**，必须**先重启服务跑迁移，再验证**；不要在迁移未执行时就让新代码对外服务。

### 21.5 备份

**cron 定时执行**，走部署脚本（内部由 better-sqlite3 执行 `VACUUM INTO`，不受系统 sqlite3 版本限制）：

```bash
# crontab -e（root），每天凌晨 3 点
0 3 * * * /var/www/weekly/deploy/backup.sh
```

备份文件命名为 `backup/weekly-YYYY-MM-DD.db`：每天一份，当天重复执行会覆盖；默认保留 30 天，超期自动清理。

配合 **ECS 磁盘快照**（控制台手动或自动策略）。

**恢复方式**：停服务 → 用备份文件覆盖 `data/weekly.db` → 删掉残留的 `-wal` / `-shm` 文件 → 启服务。

**⚠️ 不要直接 `cp` 数据库文件**——WAL 模式下可能拿到不一致的快照。同理，恢复时如果残留旧的 `-wal` 文件，新库会读取到旧事务。

### 21.6 不要做的事

- **不要在服务器上 `git pull` 后直接跑源码**——上传构建产物，服务器不装 devDependencies
- **不要把 `.env` 提交进仓库或打进产物**
- **不要把服务器公网 IP、同机其他应用的名称写进仓库**——文档统一用占位符（见 `doc/weekly-deploy.md` 的脱敏约定）
- **不要开 3701 端口到公网**——Node 只在 127.0.0.1 后面
- **不要在 Nginx 里配 CORS 头**——前后端同源，不需要

### 21.7 自动发布（GitHub Actions）

日常发布走 `.github/workflows/deploy.yml`：推送到 `main`（或手动触发）后，CI 构建前后端产物 → 打包（只含 `web/dist`、`server/dist`、两份 `package*.json`）→ scp 上传到 `/var/www/weekly/releases/<短SHA>.tar.gz` → SSH 执行 `deploy/release.sh` → 从公网验证首页与 `/api/health`。

需配置的 Secrets：`ECS_HOST`、`ECS_SSH_KEY`（必填）；`ECS_USER`（默认 `root`）、`ECS_PORT`（默认 `22`）、`ECS_KNOWN_HOSTS`（可选）。

**四条约束：**

1. **发布包不含源码 / `node_modules` / `.env` / `data/`**——源码不上服务器，依赖在服务器上 `npm ci --omit=dev`（原生模块必须在目标机器装），配置与数据只存在于服务器
2. **Nginx 配置不由 CI 覆盖**——改了 `deploy/server_weekly.conf` 需手动同步到 `/etc/nginx/conf.d/` 再 `nginx -t && systemctl reload nginx`
3. **CI 的 `NODE_VERSION` 必须与线上一致（20）**，理由见 §21.1
4. **`ECS_USER` 必须与持有 pm2 的用户一致**（这台机器上是 `root`），否则 `pm2` 读不到进程列表，会把「进程不存在」当成首次部署

§21.4 的手动流程保留作为兜底（CI 不可用、或需要单文件热修时使用）。

---

## 22. 关于参考规范中不适用的条目

本文档的前端部分参考了团队通用《前端开发规范（React 和 Vue3）》。该文档是**纯前端**规范，本项目为前后端一体，**后端规范（§7）为本项目原创补充**，不在参考文档范围内。

以下是参考文档中**不适用于本项目**的条目，显式说明以免误用：

| 通用规范条目 | 本项目处理 |
|---|---|
| 使用 pnpm | **用 npm**——`better-sqlite3` 是原生模块，npm 的扁平 node_modules 最省心 |
| 所有 POST 必须带 CSRF 令牌 | **用 `SameSite=Strict` Cookie**——理由见 §11 |
| Vue 3 相关规范 | **本项目不用 Vue** |
| 路由组件懒加载 | 5 条路由的 SPA，无此需求 |
| React 优先 Zustand / Vue 用 Pinia | **不引入任何状态管理库**——用 `useState` + Context |
| 优先使用 SCSS + BEM 做作用域隔离 | **CSS Modules + SCSS**——模块隔离交给构建工具而非命名约定 |
| Tailwind | **明确排除**——布局规则集中写在 `.module.scss` 更易整体阅读 |
| `components/commons/` 存放公共组件 | 本项目组件数量少（约 10 个），统一放 `components/` 一层，不分子目录 |
| 数据库规范章节（仅 3 行） | 本项目后端风险高，扩展为完整 §7 |

---

## 遇到不确定时

需求文档在 `weekly-PRD.md`，**与本文冲突时以 PRD 为准**。

若 PRD 未覆盖某个决策：

1. 先检查 PRD §六「已拍板决策记录」，大概率已有结论
2. 仍然没有 → **问，不要猜**。选错技术栈或破坏数据隔离的代价，远高于多问一句

**这个项目最不能容忍的错误**：让一个用户看到或改到另一个用户的数据。任何涉及查询的改动，都要先过一遍红线 1。

> 优先保证代码质量，其次是正确性，最后才是开发速度。
