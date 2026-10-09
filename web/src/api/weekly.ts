import { request } from './client';
import type {
  SaveWeeklyBody,
  WeeklyExportResponse,
  WeeklyResponse,
  WrittenWeeksResponse,
} from '@/types/api';
import type { WeekRef } from '@/types/models';

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

/**
 * 批量导出指定周区间内的「已写」周报
 * @param from - 起始周次
 * @param to - 结束周次（闭区间，且不得早于起始周）
 * @returns 区间内全部已写周报，服务端已按年、周升序返回
 * @remarks 走查询串而不是路径参数：区间有四个维度，塞进路径既难读，也容易与
 * `/:year/:week` 这条参数路由的匹配产生歧义。
 */
export const fetchWeeklyExport = (from: WeekRef, to: WeekRef): Promise<WeeklyExportResponse> => {
  const query = new URLSearchParams({
    fromYear: String(from.year),
    fromWeek: String(from.week),
    toYear: String(to.year),
    toWeek: String(to.week),
  });
  return request.get<WeeklyExportResponse>(`/api/weekly/export?${query.toString()}`);
};
