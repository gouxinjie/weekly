/**
 * 应用入口
 * @description 挂载 React 应用并引入全局样式
 * @author gouxinjie
 * @created 2026-09-18
 * @updated 2026-10-08
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

/**
 * 禁止移动端缩放（iOS 兜底）
 * @returns 无
 * @remarks index.html 的 viewport 已写了 user-scalable=no 与 maximum-scale，
 * 但 iOS 10 起的 Safari 会忽略这两个值，双指照样能把页面放大；
 * Safari 专有的 gesture 事件是那边目前唯一可靠的拦截点，因此补这一道。
 * Android Chrome 与多数国产浏览器由 viewport 与样式里的 touch-action 拦住，不需要这里。
 * 只在粗指针（触屏）设备上注册：桌面端用不着，也不必白挂一个全局监听。
 */
const lockMobileZoom = (): void => {
  if (!window.matchMedia('(pointer: coarse)').matches) return;

  // gesturestart 是 Safari 专有事件，TS 的 DOM 事件表里没有它，按事件名字符串注册
  document.addEventListener('gesturestart', (event: Event) => {
    event.preventDefault();
  });
};

lockMobileZoom();

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
