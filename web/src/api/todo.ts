import { request } from './client';
import type { CreateTodoBody, TodoListResponse, TodoSummary, UpdateTodoBody } from '@/types/api';

/**
 * 获取全部待办
 * @returns 待办列表，已按「置顶优先、创建先后」排序
 */
export const fetchTodos = (): Promise<TodoListResponse> =>
  request.get<TodoListResponse>('/api/todo');

/**
 * 获取标记到指定周的待办（周报右栏「本周待办」）
 * @param year - ISO 年
 * @param week - ISO 周次
 * @returns 只读的待办列表
 */
export const fetchTodosByWeek = (
  year: number,
  week: number,
): Promise<TodoListResponse> =>
  request.get<TodoListResponse>(`/api/todo/reference/${year}/${week}`);

/**
 * 新建待办
 * @param body - 待办文本与可选的周次标记
 * @returns 新建的待办
 */
export const createTodo = (body: CreateTodoBody): Promise<TodoListResponse[number]> =>
  request.post<TodoListResponse[number]>('/api/todo', body);

/**
 * 更新待办（全量提交）
 * @param id - 待办 ID
 * @param body - 完整字段
 * @returns 无
 */
export const updateTodo = (id: number, body: UpdateTodoBody): Promise<null> =>
  request.put<null>(`/api/todo/${id}`, body);

/**
 * 删除待办
 * @param id - 待办 ID
 * @returns 无
 */
export const deleteTodo = (id: number): Promise<null> =>
  request.delete<null>(`/api/todo/${id}`);

/**
 * 拖拽排序：提交同一分组内拖拽后的新顺序（M-05）
 * @param ids - 该分组内待办的 ID 顺序
 * @returns 无
 */
export const reorderTodos = (ids: number[]): Promise<null> =>
  request.put<null>('/api/todo/order', { ids });

/**
 * 获取待办概要：只取未完成条数，供页签角标使用（M-09）
 * @returns 未完成条数
 */
export const fetchTodoSummary = (): Promise<TodoSummary> =>
  request.get<TodoSummary>('/api/todo/summary');
