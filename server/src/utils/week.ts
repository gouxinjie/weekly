import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { config } from '../config';
import type { WeekRef } from '../types/models';

dayjs.extend(isoWeek);

/** ISO 8601 日期格式（YYYY-MM-DD） */
export const ISO_DATE_FORMAT = 'YYYY-MM-DD';

/** 周次区间 */
export interface WeekRange {
  /** 该周周一，YYYY-MM-DD */
  start: string;
  /** 该周周日，YYYY-MM-DD */
  end: string;
}

/**
 * 校验 (year, week) 是否为合法的可写周次
 * @param year - ISO 年
 * @param week - ISO 周次
 * @returns 是否合法
 * @remarks 红线 3：起点按「周」判断而不是按「日期」判断。
 * 2026 年第 1 周的周一是 2025-12-29，若写成 date >= '2026-01-01' 会误拒合法数据。
 */
export const isValidWeek = (year: number, week: number): boolean => {
  if (!Number.isInteger(year) || !Number.isInteger(week)) return false;
  if (week < 1 || week > config.maxWeek) return false;
  return year >= config.startYear;
};

/**
 * 计算某周的周一与周日
 * @param year - ISO 年
 * @param week - ISO 周次（1-53）
 * @returns 该周的起止日期（ISO 8601 日期字符串）
 * @remarks 严格 ISO 8601：周一为一周起点，跨年周按 ISO 年归属、一周不拆分。
 * 例：2026 年第 1 周 → 2025-12-29 ~ 2026-01-04；2027-01-01 属于 2026 年第 53 周。
 */
export const getWeekRange = (year: number, week: number): WeekRange => {
  // ISO 8601 规定 1 月 4 日必定落在当年的第 1 周，以它为锚点可避免跨年周的歧义。
  // 注意：dayjs 的 isoWeekYear() 只实现了读数（不接受参数），因此不能写成 isoWeekYear(year).isoWeek(week)。
  const firstMonday = dayjs(`${year}-01-04`).startOf('isoWeek');
  const monday = firstMonday.add((week - 1) * 7, 'day');
  return {
    start: monday.format(ISO_DATE_FORMAT),
    end: monday.add(6, 'day').format(ISO_DATE_FORMAT),
  };
};

/**
 * 取当前日期所属的 ISO 年与周次
 * @returns 当前 ISO 年与周次
 * @remarks 必须用 isoWeekYear() 而非 year()：2027-01-01 的 ISO 年是 2026。
 */
export const getCurrentWeek = (): WeekRef => {
  const now = dayjs();
  return { year: now.isoWeekYear(), week: now.isoWeek() };
};

/**
 * 判断某个周次是否已过去（用于备忘过期高亮）
 * @param year - ISO 年
 * @param week - ISO 周次
 * @returns 该周是否早于当前周
 */
export const isPastWeek = (year: number, week: number): boolean => {
  const current = getCurrentWeek();
  if (year !== current.year) return year < current.year;
  return week < current.week;
};


