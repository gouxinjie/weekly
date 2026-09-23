/**
 * 应用入口
 * @description 挂载 React 应用并引入全局样式
 * @author gouxinjie
 * @created 2026-09-18
 * @updated 2026-09-23
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '@/App';
import '@/styles/global.scss';
import { applyTheme, readStoredTheme } from '@/utils/theme';

/**
 * 首屏主题
 * 说明：在挂载之前先落一次主题，省掉「先按默认亮色画一帧再跳到深色」的闪动。
 * 这里与 ThemeProvider 的 effect 做的是同一件事，重复调用没有副作用。
 */
applyTheme(readStoredTheme());

/** 应用挂载点 */
const container = document.getElementById('root');
if (container === null) {
  throw new Error('找不到挂载点 #root');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
