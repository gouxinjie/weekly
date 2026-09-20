import { request } from './client';
import type { CreateMemoBody, MemoListResponse, UpdateMemoBody } from '@/types/api';

/**
 * 获取全部备忘
 * @returns 备忘列表，已按「置顶优先、创建先后」排序
 */
export const fetchMemos = (): Promise<MemoListResponse> =>
  request.get<MemoListResponse>('/api/memo');

/**
 * 获取标记到指定周的备忘（周报右栏「本周参考」）
 * @param year - ISO 年
 * @param week - ISO 周次
 * @returns 只读的备忘列表
 */
export const fetchMemosByWeek = (
  year: number,
  week: number,
): Promise<MemoListResponse> =>
  request.get<MemoListResponse>(`/api/memo/reference/${year}/${week}`);

/**
 * 新建备忘
 * @param body - 待办文本与可选的周次标记
 * @returns 新建的备忘
 */
export const createMemo = (body: CreateMemoBody): Promise<MemoListResponse[number]> =>
  request.post<MemoListResponse[number]>('/api/memo', body);

/**
 * 更新备忘（全量提交）
 * @param id - 备忘 ID
 * @param body - 完整字段
 * @returns 无
 */
export const updateMemo = (id: number, body: UpdateMemoBody): Promise<null> =>
  request.put<null>(`/api/memo/${id}`, body);

/**
 * 删除备忘
 * @param id - 备忘 ID
 * @returns 无
 */
export const deleteMemo = (id: number): Promise<null> =>
  request.delete<null>(`/api/memo/${id}`);
