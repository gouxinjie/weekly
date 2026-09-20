import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { MAX_WEEK, START_YEAR } from '@/constants';
import type { WeekRef } from '@/types/models';

/**
 * 加载 dayjs 的 ISO 周插件
 * 注意：插件只实现了 isoWeekYear() 的读数，不接受参数，
 * 因此设置年份不能写成 isoWeekYear(year).isoWeek(week)，必须换用 1 月 4 日锚点算法。
 */
dayjs.extend(isoWeek);

/** ISO 8601 日期格式 */
export const ISO_DATE_FORMAT = 'YYYY-MM-DD';

/** 周次区间 */
export interface WeekRange {
  /** 该周周一，YYYY-MM-DD */
  start: string;
  /** 该周周日，YYYY-MM-DD */
  end: string;
}

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
 * 校验 (year, week) 是否落在时间轴范围内
 * @param year - ISO 年
 * @param week - ISO 周次
 * @returns 是否合法
 * @remarks 红线 3：按「周」判断而不是按日期判断，2026 年第 1 周的周一是 2025-12-29。
 */
export const isValidWeek = (year: number, week: number): boolean => {
  if (!Number.isInteger(year) || !Number.isInteger(week)) return false;
  if (week < 1 || week > MAX_WEEK) return false;
  return year >= START_YEAR;
};

/**
 * 计算某周的周一与周日
 * @param year - ISO 年
 * @param week - ISO 周次（1-53）
 * @returns 该周起止日期
 * @remarks ISO 8601 规定 1 月 4 日必定落在第 1 周，以它为锚点可避免跨年周歧义。
 */
export const getWeekRange = (year: number, week: number): WeekRange => {
  const firstMonday = dayjs(`${year}-01-04`).startOf('isoWeek');
  const monday = firstMonday.add((week - 1) * 7, 'day');
  return {
    start: monday.format(ISO_DATE_FORMAT),
    end: monday.add(6, 'day').format(ISO_DATE_FORMAT),
  };
};

/**
 * 判断某个周次是否已过去（用于备忘过期高亮，仅视觉提示）
 * @param year - ISO 年
 * @param week - ISO 周次
 * @returns 该周是否早于当前周
 */
export const isPastWeek = (year: number, week: number): boolean => {
  const current = getCurrentWeek();
  if (year !== current.year) return year < current.year;
  return week < current.week;
};

/**
 * 计算相对某周偏移若干周后的周次
 * @param year - 起始 ISO 年
 * @param week - 起始 ISO 周次
 * @param offset - 偏移量，可为负数
 * @returns 目标周次；越界时返回 null
 */
export const shiftWeek = (year: number, week: number, offset: number): WeekRef | null => {
  const range = getWeekRange(year, week);
  const target = dayjs(range.start).add(offset * 7, 'day');
  const result: WeekRef = { year: target.isoWeekYear(), week: target.isoWeek() };
  return isValidWeek(result.year, result.week) ? result : null;
};

/**
 * 生成从起点年份到结束年份的全部周次
 * @param endYear - 结束年份（含）
 * @returns 周次列表，每年 MAX_WEEK 周（上限 53，不写死 52）
 */
export const buildWeekRange = (endYear: number): WeekRef[] => {
  const result: WeekRef[] = [];
  for (let year = START_YEAR; year <= endYear; year += 1) {
    for (let week = 1; week <= MAX_WEEK; week += 1) {
      result.push({ year, week });
    }
  }
  return result;
};
