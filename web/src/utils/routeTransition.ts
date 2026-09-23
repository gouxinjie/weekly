/**
 * 路由切换过渡
 * @description 用 View Transitions API 把「旧页面淡出、新页面淡入」交给浏览器：
 * 过渡期间画面是两张快照在合成，真实的 DOM 切换（列数变化、内容重排、编辑器重建）
 * 全部被冻结在过渡里，用户看到的是一次交叉淡化，而不是布局跳一下。
 * 不支持该 API 或系统开启「减少动态效果」的浏览器直接跳转，
 * 此时由内容区自己的淡入兜底（见 AppLayout）。
 * @author gouxinjie
 * @created 2026-09-23
 */
import { flushSync } from 'react-dom';
import type { NavigateFunction, NavigateOptions } from 'react-router-dom';

/**
 * 进行中的视图过渡数量
 * @remarks 连点页签时浏览器会跳过前一个过渡、立刻开新的，前一个的 finished 会兑现，
 * 用计数而不是布尔才能避免「后一个过渡还在跑、标记却被前一个清掉」的竞态。
 */
let activeTransitions = 0;

/**
 * 本次切换是否正由视图过渡负责
 * @returns 是则内容区不再叠加自己的淡入动画
 */
export const isViewTransitionActive = (): boolean => activeTransitions > 0;

/**
 * 跳转并播放视图过渡
 * @param navigate - react-router 的导航函数
 * @param to - 目标路径
 * @param options - 导航选项（如 replace、state）
 * @returns 无
 */
export const navigateWithTransition = (
  navigate: NavigateFunction,
  to: string,
  options?: NavigateOptions,
): void => {
  // 系统开启「减少动态效果」时直接落位：交叉淡化也是动效。
  // 在 JS 侧就不开启过渡，global.scss 也就不需要 animation: none 的兜底——
  // 新旧快照层带 plus-lighter 混合，双不透明叠加会过曝发白，CSS 里兜底反而有闪白风险
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    navigate(to, options);
    return;
  }

  // 不支持的浏览器直接跳转：没有过渡，但功能一切照常
  if (typeof document.startViewTransition !== 'function') {
    navigate(to, options);
    return;
  }

  activeTransitions += 1;

  try {
    /*
     * flushSync 不可省：视图过渡要求回调返回前 DOM 已经是新状态，
     * 否则抓到的新旧快照是同一帧画面，过渡就退化成「原地闪一下」。
     */
    const transition = document.startViewTransition(() => {
      flushSync(() => {
        navigate(to, options);
      });
    });

    void transition.finished.finally(() => {
      activeTransitions -= 1;
    });
  } catch {
    // 过渡没能启动时至少把页面跳过去，否则点击毫无反馈
    activeTransitions -= 1;
    navigate(to, options);
  }
};
