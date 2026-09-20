/**
 * 应用入口
 * @description 挂载 React 应用并引入全局样式
 * @author gouxinjie
 * @created 2026-09-18
 * @updated 2026-09-18
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '@/App';
import '@/styles/global.scss';

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
