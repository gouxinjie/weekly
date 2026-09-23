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

/** 已展开年份在 localStorage 中的键名（未记录的年份一律折叠） */
export const EXPANDED_YEARS_KEY = 'weekly:expanded-years';

/** 已展开月份在 localStorage 中的键名，元素形如「2026-9」（未记录的月份一律折叠） */
export const EXPANDED_MONTHS_KEY = 'weekly:expanded-months';

/** 「记住账号」在 localStorage 中的键名 */
export const REMEMBER_PHONE_KEY = 'weekly:remember-phone';

/** 主题在 localStorage 中的键名（未记录时使用默认主题） */
export const THEME_KEY = 'weekly:theme';

/** 主题标识：亮色 / 暖纸 / 深色，与 variables.scss 的 [data-theme='xxx'] 一一对应 */
export type ThemeName = 'light' | 'paper' | 'dark';

/** 主题选项定义 */
export interface ThemeOption {
  /** 主题标识，同时作为根元素的 data-theme 取值 */
  value: ThemeName;
  /** 展示名称 */
  label: string;
  /** 一句话说明，帮助判断该在什么场景下选它 */
  description: string;
}

/** 可选主题，顺序即设置页中的排列顺序 */
export const THEMES: ThemeOption[] = [
  { value: 'light', label: '浅色', description: '暖白底 + 深墨绿主色，默认主题' },
  { value: 'paper', label: '暖纸', description: '米黄护眼底，长时间读写更柔和' },
  { value: 'dark', label: '深色', description: '深墨底，适合夜间或暗光环境' },
];

/** 默认主题：首次访问（本地无记录）时使用 */
export const DEFAULT_THEME: ThemeName = 'light';

/** 周报内容字数上限（编辑区底部计数用） */
export const MAX_CONTENT_CHARS = 2000;

/** 待办分类定义：value 与服务端 TODO_CATEGORIES 保持一致 */
export interface TodoCategoryOption {
  /** 分类标识，空串表示未分类 */
  value: string;
  /** 展示文案 */
  label: string;
}

/** 待办分类可选项，顺序固定 */
export const TODO_CATEGORIES: TodoCategoryOption[] = [
  { value: '', label: '无分类' },
  { value: 'product', label: '产品' },
  { value: 'dev', label: '开发' },
  { value: 'test', label: '测试' },
  { value: 'doc', label: '文档' },
  { value: 'life', label: '生活' },
];

/** 新周报首次进入时注入的模板 */
export const WEEKLY_TEMPLATE = `### 本周进展

### 遇到的问题

### 下周计划
`;

/** 忘记密码联系方式（G-05：人工核对后重置） */
export const CONTACT_PHONE = '13113183859';
