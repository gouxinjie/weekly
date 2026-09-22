/**
 * 待办的周分组与状态段
 * @description 清单的分组口径必须只有一处定义：清单渲染、周报右栏、拖拽排序都依赖它。
 *              单独抽成工具是为了让 TodoList 与待办页共用——拖拽排序要从「完整列表」
 *              而不是「当前筛选结果」里取同段条目，两边必须算出同一个段。
 * @author gouxinjie
 * @created 2026-09-22
 * @updated 2026-09-22
 */
import { getTodoWeek } from './week';
import type { Todo } from '@/types/models';

/** 组内状态段：置顶（置顶且未完成）/ 未完成（未置顶、未完成）/ 已完成 */
export type TodoSegment = 'pinned' | 'undone' | 'done';

/**
 * 取一条待办的周分组键
 * @param todo - 待办
 * @returns 形如 `2026-39` 的分组键
 * @remarks 所属周取「手动标记优先、未标记按创建时间推导」，与时间轴、筛选同一口径
 */
export const todoGroupKey = (todo: Todo): string => {
  const { year, week } = getTodoWeek(todo);
  return `${year}-${week}`;
};

/**
 * 取一条待办所属的状态段
 * @param todo - 待办
 * @returns 已完成段 / 置顶段（置顶且未完成）/ 未完成段
 * @remarks 已完成优先于置顶：一条已完成的置顶条目落到「已完成」，避免它同时出现在两段里
 */
export const todoSegment = (todo: Todo): TodoSegment => {
  if (todo.done) return 'done';
  return todo.pinned ? 'pinned' : 'undone';
};
