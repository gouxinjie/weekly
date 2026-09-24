/**
 * @file 移动端断点判定 Hook
 * @description 把「当前视口是否走移动端骨架」这件事收敛到一处：
 * 样式侧用 `@media (max-width: 1023px)`，脚本侧统一用本 Hook，
 * 两边都以 constants 的 MOBILE_MEDIA_QUERY 为准，不各写一遍数字。
 * @author gouxinjie
 * @created 2026-09-24
 * @updated 2026-09-24
 */
import { useEffect, useState } from 'react';
import { MOBILE_MEDIA_QUERY } from '@/constants';

/**
 * 判断当前视口是否命中移动端断点
 * @returns 命中时为 true（对应媒体查询 max-width: 1023px）
 * @remarks 用 matchMedia 而不是监听 resize 再比宽度：
 * 1. matchMedia 只在跨越断点的那一次触发回调，拖动窗口时不会每帧 setState；
 * 2. 初值同步读取，首帧就按正确的骨架渲染，避免「先按桌面画一帧再跳成移动端」。
 * 这个 Hook 只用于必须由脚本决定的分支（如抽屉初始是否收起）；
 * 纯视觉差异一律交给 CSS 媒体查询，不引入额外的重渲染。
 */
const useIsMobile = (): boolean => {
  const [isMobile, setIsMobile] = useState<boolean>(
    () => window.matchMedia(MOBILE_MEDIA_QUERY).matches,
  );

  useEffect(() => {
    const query = window.matchMedia(MOBILE_MEDIA_QUERY);

    /**
     * 断点命中状态变化
     * @param event - 媒体查询变更事件
     * @returns 无
     */
    const handleChange = (event: MediaQueryListEvent): void => setIsMobile(event.matches);

    query.addEventListener('change', handleChange);
    return () => {
      query.removeEventListener('change', handleChange);
    };
  }, []);

  return isMobile;
};

export default useIsMobile;
