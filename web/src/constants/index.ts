/**
 * 前端领域常量
 * 说明：START_YEAR 与 MAX_WEEK 由构建时的环境变量注入（见 vite.config.ts 的 define），
 * 注入的是数字字面量，不会把整个环境变量表暴露到前端产物里。
 */
import type { NoteColor } from '@/types/models';

/** 时间轴起点年份（红线 3），必须与服务端一致，不可从用户注册时间推导 */
export const START_YEAR: number = __START_YEAR__;

/** ISO 周次上限（红线 3），一年最多 53 周 */
export const MAX_WEEK: number = __MAX_WEEK__;

/** 自动保存延迟（毫秒）：输入停止后落库 */
export const AUTOSAVE_DELAY = 800;

/**
 * 路由切换过渡时长（毫秒）
 * 说明：200ms 是「看得见过渡」与「不拖慢操作」的平衡点；再长会让人觉得页面迟钝。
 * View Transitions 与降级淡入共用这一节奏，global.scss 里的动画时长与其保持一致。
 */
export const ROUTE_TRANSITION_MS = 200;

/**
 * 路由切换过渡缓动：末段放缓，落位更稳
 * 说明：只动 opacity 与 transform 两个合成属性，动画跑在合成线程，不触发布局。
 * View Transitions 与降级淡入共用这一曲线，global.scss 里的 timing-function 与其保持一致。
 */
export const ROUTE_TRANSITION_EASING = 'cubic-bezier(0.22, 0.61, 0.36, 1)';

/** 路由切换降级淡入的起始位移（px）：只给 4px，再大就成了整块内容在滑动 */
export const ROUTE_TRANSITION_SHIFT_PX = 4;

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

/** 便签纸颜色选项：value 与服务端 routes/note.ts 的 NOTE_COLORS 保持一致 */
export interface NoteColorOption {
  /** 颜色标识，空串表示默认底色 */
  value: NoteColor;
  /** 展示文案，用于颜色圆点的无障碍标签 */
  label: string;
}

/** 便签纸颜色可选项（默认底 / 黄 / 绿），顺序固定；样式类名映射见 components/NoteCard */
export const NOTE_COLORS: NoteColorOption[] = [
  { value: '', label: '默认底色' },
  { value: 'yellow', label: '黄色便签' },
  { value: 'green', label: '绿色便签' },
];

/**
 * 便签标题字数上限
 * 说明：与服务端 constants.ts 的 NOTE_TITLE_MAX_LENGTH 必须一致。
 * 标题是单行索引，不承载长文本，超出上限的输入由 maxLength 拦下。
 */
export const NOTE_TITLE_MAX_CHARS = 100;

/** 新周报首次进入时注入的模板 */
export const WEEKLY_TEMPLATE = `### 本周进展

### 遇到的问题

### 下周计划
`;

/** 忘记密码联系方式（G-05：人工核对后重置） */
export const CONTACT_PHONE = '13113183859';

/** 正文默认字号：编辑器基础字号，也是字号下拉没有设置过字号时的回显值 */
export const DEFAULT_FONT_SIZE = '14px';

/** 字号档位（与设计稿一致），顺序即下拉中的排列顺序 */
export const FONT_SIZE_OPTIONS: string[] = [
  '12px',
  '13px',
  '14px',
  '15px',
  '16px',
  '19px',
  '22px',
  '24px',
  '29px',
  '32px',
  '40px',
  '48px',
];

/**
 * 字号白名单正则源码（不含定界符）：8–72px 的整数
 * 说明：档位最高 48px，上限放宽到 72px 以容忍从外部粘贴进来的更大字号。
 * 编辑器（解析与渲染）与预览（解析内联样式）共用这一份定义——
 * 各写一份时极易只改一侧，出现「编辑区显示正常、预览里字号丢失」的隐蔽回归。
 */
export const FONT_SIZE_PATTERN = '(?:[89]|1\\d|2\\d|3\\d|4\\d|5\\d|6\\d|7[0-2])px';

/** 单个字号值是否合法（编辑器侧的解析与渲染校验） */
export const SAFE_FONT_SIZE = new RegExp(`^${FONT_SIZE_PATTERN}$`);
