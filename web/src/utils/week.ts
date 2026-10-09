import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { MAX_WEEK, START_YEAR } from '@/constants';
import type { Todo, WeekRef } from '@/types/models';

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
 * 取某个日期所属的 ISO 年与周次
 * @param date - 可被 dayjs 解析的日期或时间戳字符串（如待办的创建时间）
 * @returns 该日期所属的 ISO 年与周次
 * @remarks 同 getCurrentWeek：必须用 isoWeekYear() 而不是 year()，
 *          否则 2027-01-01 会被算成 2027 年第 1 周，而它实际属于 2026 年第 53 周。
 */
export const getWeekOfDate = (date: string): WeekRef => {
  const target = dayjs(date);
  return { year: target.isoWeekYear(), week: target.isoWeek() };
};

/**
 * 取一条待办的所属周：手动标记的周优先，未标记时按创建时间推导
 * @param todo - 待办（只需要 year / week / createdAt 三个字段）
 * @returns 所属的 ISO 年与周次
 * @remarks 清单分组、左侧「本周」筛选、行上的状态标签都必须走这一个口径，
 *          否则会出现「同一条待办在分组里属于本周、却不出现在『本周』筛选里」这种自相矛盾。
 */
export const getTodoWeek = (todo: Pick<Todo, 'year' | 'week' | 'createdAt'>): WeekRef =>
  todo.year !== null && todo.week !== null
    ? { year: todo.year, week: todo.week }
    : getWeekOfDate(todo.createdAt);

/**
 * 校验 (year, week) 是否落在时间轴范围内
 * @param year - ISO 年
 * @param week - ISO 周次
 * @returns 是否合法
 * @remarks 红线 3：按「周」判断而不是按日期判断，起点年 2025 的第 1 周周一是 2024-12-30。
 * 上限取「MAX_WEEK 与该年实际周数的较小值」（见 getWeekCount）：
 * 2025 年只有 52 周，若一律放行到 53，顶栏跳转与 URL 都能进了「2025 年第 53 周」，
 * 而它与 2026 年第 1 周是同一区间。
 */
export const isValidWeek = (year: number, week: number): boolean => {
  if (!Number.isInteger(year) || !Number.isInteger(week)) return false;
  if (year < START_YEAR || week < 1) return false;
  return week <= Math.min(MAX_WEEK, getWeekCount(year));
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
 * 计算某个 ISO 年实际包含的周数
 * @param year - ISO 年
 * @returns 该年的周数（52 或 53）
 * @remarks 用「该年第 1 周的周一」到下一年第 1 周的周一相差的整周数推导；
 *          2026 年为 53 周，不能写死 52，否则会丢掉每年的最后一周。
 */
export const getWeekCount = (year: number): number => {
  const firstMonday = dayjs(getWeekRange(year, 1).start);
  const nextFirstMonday = dayjs(getWeekRange(year + 1, 1).start);
  return Math.round(nextFirstMonday.diff(firstMonday, 'day') / 7);
};

/**
 * 取某个周次归属的月份
 * @param year - ISO 年
 * @param week - ISO 周次
 * @returns 归属月份（1-12）
 * @remarks 按该周的周四归属：周四是 ISO 周的代表日，也是本周天数最多所在月份，
 *          因此 2025 年第 1 周（周一为 2024-12-30、周四为 2025-01-02）归入 1 月，
 *          不会出现「1 月没有第 1 周」。
 */
export const getWeekMonth = (year: number, week: number): number => {
  const { start } = getWeekRange(year, week);
  return dayjs(start).add(3, 'day').month() + 1;
};

/**
 * 取某个周次在其归属月份内的序号
 * @param year - ISO 年
 * @param week - ISO 周次（1-53）
 * @returns 该周是归属月份中的第几周（从 1 开始）
 * @remarks 周四决定整周归属哪个月，因此以「该月第一个周四所在周的周一」为基准算偏移。
 *          这样 2025 年第 1 周（周一为 2024-12-30、周四为 2025-01-02）返回 1，
 *          不会因为周一落在上一年 12 月而算出 0 或负数。
 */
export const getWeekIndexInMonth = (year: number, week: number): number => {
  const month = getWeekMonth(year, week);
  const firstDay = dayjs(`${year}-${String(month).padStart(2, '0')}-01`);
  // 该月第一个周四：由 1 号向后推到最近的周四
  const firstThursday = firstDay.add((4 - firstDay.isoWeekday() + 7) % 7, 'day');
  const firstMonday = firstThursday.subtract(3, 'day');
  const monday = dayjs(getWeekRange(year, week).start);
  return Math.round(monday.diff(firstMonday, 'day') / 7) + 1;
};

/**
 * 判断某个周次是否已过去（用于待办过期提示，仅视觉）
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
 * 列出某个 ISO 年的全部合法周次（用于「导出本年度」）
 * @param year - ISO 年
 * @returns 该年周次列表，升序
 * @remarks 上限取「MAX_WEEK 与该年实际周数的较小值」（见 isValidWeek）：
 * 2025 年只有 52 周，一律列到 53 会让导出范围里凭空多出一个与 2026 年第 1 周同区间的周次。
 */
export const listWeeksOfYear = (year: number): WeekRef[] => {
  const total = Math.min(MAX_WEEK, getWeekCount(year));
  const weeks: WeekRef[] = [];
  for (let week = 1; week <= total; week += 1) {
    if (isValidWeek(year, week)) weeks.push({ year, week });
  }
  return weeks;
};

/**
 * 列出某个年份内指定周次闭区间（用于「导出自定义区间」）
 * @param year - ISO 年
 * @param fromWeek - 起始 ISO 周次
 * @param toWeek - 结束 ISO 周次
 * @returns 区间内合法周次列表，升序；起止越界或倒序时返回空数组
 */
export const listWeeksInRange = (year: number, fromWeek: number, toWeek: number): WeekRef[] => {
  const weeks: WeekRef[] = [];
  for (let week = fromWeek; week <= toWeek; week += 1) {
    if (isValidWeek(year, week)) weeks.push({ year, week });
  }
  return weeks;
};

/**
 * 列出「最近 N 个月」覆盖的周次（用于「导出最近几个月」）
 * @param months - 月份数，至少按 1 处理
 * @returns 归属月份落在该范围内的周次列表，升序
 * @remarks 月份归属按周四判定（见 getWeekMonth），与左栏时间轴的月份分组同一口径——
 * 若改用「周一起止日期落入区间」，会出现同一周在导出里归 8 月、在树里归 9 月的自相矛盾。
 * 枚举起点取「起始月月初所在周的上一周」，避免漏掉「周一落在上月末、周四落在起始月」的跨月首周；
 * 早于时间轴起点（START_YEAR）的周由 isValidWeek 过滤掉。
 */
export const listWeeksInRecentMonths = (months: number): WeekRef[] => {
  const now = dayjs();
  const span = Math.max(Math.floor(months), 1);
  const current = getCurrentWeek();

  // 目标月份集合，形如 { '2026-8', '2026-9', '2026-10' }
  const targetMonths = new Set<string>();
  for (let offset = 0; offset < span; offset += 1) {
    const point = now.subtract(offset, 'month');
    targetMonths.add(`${point.year()}-${point.month() + 1}`);
  }

  // 按周推进：起点为起始月月初所在周再往前一周，终点为当前周的周一
  const startPoint = now.subtract(span - 1, 'month').startOf('month');
  const startRef = getWeekOfDate(startPoint.format(ISO_DATE_FORMAT));
  let cursor = dayjs(getWeekRange(startRef.year, startRef.week).start).subtract(7, 'day');
  const lastMonday = dayjs(getWeekRange(current.year, current.week).start);

  const weeks: WeekRef[] = [];
  while (!cursor.isAfter(lastMonday, 'day')) {
    const ref = getWeekOfDate(cursor.format(ISO_DATE_FORMAT));
    const monthKey = `${ref.year}-${getWeekMonth(ref.year, ref.week)}`;
    if (isValidWeek(ref.year, ref.week) && targetMonths.has(monthKey)) {
      weeks.push(ref);
    }
    cursor = cursor.add(7, 'day');
  }
  return weeks;
};
