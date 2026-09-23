/**
 * 主题工具
 * @description 主题的读取、持久化与落地。
 * 主题属于纯本地偏好：不进服务端、不随账号同步，换浏览器或换设备回到默认主题。
 * 落地方式统一为给根元素写 data-theme，由 variables.scss 里的同名选择器命中变量。
 * @author gouxinjie
 * @created 2026-09-23
 * @updated 2026-09-23
 */
import { DEFAULT_THEME, THEME_KEY, THEMES } from '@/constants';
import type { ThemeName } from '@/constants';

/**
 * 判断取值是否为合法主题名
 * @param value - 待判断的字符串
 * @returns 是已注册主题时返回 true
 */
const isThemeName = (value: string): value is ThemeName =>
  THEMES.some((theme) => theme.value === value);

/**
 * 把任意字符串解析成主题
 * @param raw - 原始取值，允许为 null
 * @returns 合法主题；缺失或非法时返回 null
 * @remarks 存储里的值可能被手工改坏，也可能是旧版本留下的主题名；
 *          一律按 null 处理，由调用方决定是退回默认主题还是忽略这次变更。
 */
export const parseTheme = (raw: string | null): ThemeName | null =>
  raw !== null && isThemeName(raw) ? raw : null;

/**
 * 读取本机保存的主题
 * @returns 已保存且合法的主题；无记录或取值非法时返回默认主题
 */
export const readStoredTheme = (): ThemeName => {
  try {
    return parseTheme(window.localStorage.getItem(THEME_KEY)) ?? DEFAULT_THEME;
  } catch {
    // 隐私模式或禁用存储时 localStorage 会抛错，忽略即可，退回默认主题不影响使用
  }
  return DEFAULT_THEME;
};

/**
 * 持久化主题
 * @param theme - 要保存的主题
 * @returns 无
 */
export const saveTheme = (theme: ThemeName): void => {
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // 写入失败只影响下次访问是否记住选择，本次切换已经生效，无需中断
  }
};

/**
 * 把主题应用到根元素
 * @param theme - 目标主题
 * @returns 无
 * @remarks 同步设置 color-scheme，让浏览器自带的滚动条、表单控件与主题一致；
 *          只用 CSS 变量的话这些原生控件仍是亮色的。
 */
export const applyTheme = (theme: ThemeName): void => {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme === 'dark' ? 'dark' : 'light';
};
