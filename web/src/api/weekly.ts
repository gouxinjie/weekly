import { request } from './client';
import type { SaveWeeklyBody, WeeklyResponse, WrittenWeeksResponse } from '@/types/api';

/**
 * 获取指定周报
 * @param year - ISO 年
 * @param week - ISO 周次（1-53）
 * @returns 周报内容；未写过时 content 为空字符串
 */
export const fetchWeekly = (year: number, week: number): Promise<WeeklyResponse> =>
  request.get<WeeklyResponse>(`/api/weekly/${year}/${week}`);

/**
 * 保存指定周报
 * @param year - ISO 年
 * @param week - ISO 周次（1-53）
 * @param content - Markdown 内容
 * @returns 落库后的周报
 */
export const saveWeekly = (
  year: number,
  week: number,
  content: string,
): Promise<WeeklyResponse> => {
  const body: SaveWeeklyBody = { content };
  return request.put<WeeklyResponse>(`/api/weekly/${year}/${week}`, body);
};

/**
 * 获取全部「已写」的周次
 * @returns 有内容的周次列表，用于树节点的状态角标
 */
export const fetchWrittenWeeks = (): Promise<WrittenWeeksResponse> =>
  request.get<WrittenWeeksResponse>('/api/weekly/written');
