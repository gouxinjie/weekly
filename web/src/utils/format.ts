import dayjs from 'dayjs';

/**
 * 格式化周次标题
 * @param year - ISO 年
 * @param week - ISO 周次
 * @returns 形如「2026 年第 38 周」的字符串
 */
export const formatWeekLabel = (year: number, week: number): string =>
  `${year} 年第 ${week} 周`;

/**
 * 格式化周次日期区间（树节点用）
 * @param weekStart - 该周周一，YYYY-MM-DD
 * @param weekEnd - 该周周日，YYYY-MM-DD
 * @returns 形如「09/14–09/20」的字符串
 */
export const formatWeekRangeShort = (weekStart: string, weekEnd: string): string => {
  const start = dayjs(weekStart);
  const end = dayjs(weekEnd);
  return `${start.format('MM/DD')}–${end.format('MM/DD')}`;
};

/**
 * 格式化周次完整日期区间（标题栏用）
 * @param year - ISO 年
 * @param weekStart - 该周周一，YYYY-MM-DD
 * @param weekEnd - 该周周日，YYYY-MM-DD
 * @returns 形如「2026/09/14 – 09/20」的字符串
 */
export const formatWeekRangeFull = (
  year: number,
  weekStart: string,
  weekEnd: string,
): string => {
  const start = dayjs(weekStart);
  const end = dayjs(weekEnd);
  return `${year}/${start.format('MM/DD')} – ${end.format('MM/DD')}`;
};

/**
 * 手机号脱敏
 * @param phone - 11 位手机号
 * @returns 形如「138****1111」的字符串
 */
export const maskPhone = (phone: string): string => {
  if (phone.length !== 11) return phone;
  return `${phone.slice(0, 3)}****${phone.slice(7)}`;
};

/**
 * 统计字数
 * @param text - Markdown 原文
 * @returns 去除空白后的字符数
 * @remarks 中文按字符数计算，英文与数字同样按字符数计算，空内容返回 0。
 */
export const countChars = (text: string): number => text.replace(/\s/g, '').length;

/**
 * 格式化时间戳为简短时间
 * @param isoText - ISO 8601 时间字符串
 * @returns 形如「09/18 14:30」的字符串，无法解析时返回空串
 */
export const formatTimeShort = (isoText: string): string => {
  if (isoText === '') return '';
  const time = dayjs(isoText);
  return time.isValid() ? time.format('MM/DD HH:mm') : '';
};
