/**
 * @component 主题上下文
 * @description 用 useState + Context 管理当前主题，不引入任何状态管理库；
 * 主题只写本机 localStorage，不请求服务端；切换后立即同步到根元素的 data-theme
 * @author gouxinjie
 * @created 2026-09-23
 * @updated 2026-09-23
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { THEME_KEY } from '@/constants';
import type { ThemeName } from '@/constants';
import { applyTheme, parseTheme, readStoredTheme, saveTheme } from '@/utils/theme';

/** 上下文暴露的能力 */
interface ThemeContextValue {
  /** 当前主题 */
  theme: ThemeName;
  /** 切换主题：立即生效并写入本机存储 */
  setTheme: (theme: ThemeName) => void;
}

/** 主题上下文 */
const ThemeContext = createContext<ThemeContextValue | null>(null);

/** ThemeProvider 属性 */
interface ThemeProviderProps {
  /** 子节点 */
  children: ReactNode;
}

/**
 * 主题 Provider
 * @param props - 仅包含 children
 * @returns 包裹了上下文的节点
 */
export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  // 初始值直接读本机存储，避免「先渲染默认主题再跳一次」
  const [theme, setThemeState] = useState<ThemeName>(readStoredTheme);

  // 主题变化时同步到根元素；首次挂载也会跑一次，与入口的防闪设置保持一致
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // 多标签页联动：另一个标签页改了主题，本页跟随。
  // 只改内存状态、不回写存储——回写会再次触发对方的 storage 事件，形成互相触发
  useEffect(() => {
    const handleStorage = (event: StorageEvent): void => {
      if (event.key !== THEME_KEY) return;
      const next = parseTheme(event.newValue);
      if (next !== null) setThemeState(next);
    };

    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  /**
   * 切换主题
   * @param next - 目标主题
   * @returns 无
   */
  const setTheme = useCallback((next: ThemeName): void => {
    setThemeState(next);
    saveTheme(next);
  }, []);

  const value = useMemo<ThemeContextValue>(() => ({ theme, setTheme }), [theme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

/**
 * 读取主题上下文
 * @returns 主题上下文
 * @throws Error 在 ThemeProvider 之外调用时抛出
 */
export const useTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext);
  if (context === null) {
    throw new Error('useTheme 必须在 ThemeProvider 内部使用');
  }
  return context;
};
