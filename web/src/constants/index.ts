/**
 * 前端领域常量
 * 说明：START_YEAR 与 MAX_WEEK 由构建时的环境变量注入（见 vite.config.ts 的 define），
 * 注入的是数字字面量，不会把整个环境变量表暴露到前端产物里。
 */

/** 时间轴起点年份（红线 3），必须与服务端一致，不可从用户注册时间推导 */
export const START_YEAR: number = __START_YEAR__;

/** ISO 周次上限（红线 3），一年最多 53 周 */
export const MAX_WEEK: number = __MAX_WEEK__;

/** 自动保存延迟（毫秒）：输入停止后落库 */
export const AUTOSAVE_DELAY = 800;

/** 受保护页面的最小视口宽度（低于此宽度提示使用桌面端） */
export const MIN_DESKTOP_WIDTH = 1024;

/** 折叠状态在 localStorage 中的键名 */
export const COLLAPSED_YEARS_KEY = 'weekly:collapsed-years';

/** 新周报首次进入时注入的模板 */
export const WEEKLY_TEMPLATE = `### 本周进展

### 遇到的问题

### 下周计划
`;

/** 忘记密码联系方式（G-05：人工核对后重置） */
export const CONTACT_PHONE = '13113183859';
