import { db } from './index';
import type { WeekRef, WeeklyRow } from '../types/models';

/**
 * 查询指定周报
 * @param userId - 用户 ID，从会话推导，禁止来自前端
 * @param year - ISO 年
 * @param week - ISO 周次（1-53）
 * @returns 周报行；不存在或不属于该用户时返回 undefined
 */
export const findWeekly = (
  userId: number,
  year: number,
  week: number,
): WeeklyRow | undefined =>
  db
    .prepare('SELECT * FROM weekly WHERE user_id = ? AND year = ? AND week = ?')
    .get(userId, year, week) as WeeklyRow | undefined;

/**
 * 写入周报内容（不存在则新建，存在则覆盖）
 * @param userId - 用户 ID，必须传入
 * @param year - ISO 年
 * @param week - ISO 周次（1-53）
 * @param weekStart - 该周周一
 * @param weekEnd - 该周周日
 * @param content - Markdown 内容
 * @returns 落库后的周报行
 * @remarks 冲突目标为 (user_id, year, week)，保证一人一周一篇，且不影响其他用户写同一周。
 */
export const upsertWeekly = (
  userId: number,
  year: number,
  week: number,
  weekStart: string,
  weekEnd: string,
  content: string,
): WeeklyRow => {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO weekly (user_id, year, week, week_start, week_end, content, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, year, week) DO UPDATE SET
       content    = excluded.content,
       updated_at = excluded.updated_at`,
  ).run(userId, year, week, weekStart, weekEnd, content, now, now);

  const saved = findWeekly(userId, year, week);
  if (!saved) {
    throw new Error('周报写入失败');
  }
  return saved;
};

/**
 * 更新周报内容
 * @param userId - 用户 ID，必须传入
 * @param id - 周报记录 ID
 * @param content - Markdown 内容
 * @returns 是否更新成功（false 表示记录不存在或不属于该用户）
 * @remarks 红线 1：WHERE 必须同时带 id 与 user_id，否则知道别人的 id 就能改别人的数据。
 */
export const updateWeekly = (userId: number, id: number, content: string): boolean => {
  const result = db
    .prepare('UPDATE weekly SET content = ?, updated_at = ? WHERE id = ? AND user_id = ?')
    .run(content, new Date().toISOString(), id, userId);
  return result.changes > 0;
};

/**
 * 列出某用户全部「已写」的周次
 * @param userId - 用户 ID，必须传入
 * @returns 有内容的周次列表，用于树节点的状态角标
 */
export const listWrittenWeeks = (userId: number): WeekRef[] =>
  db
    .prepare(
      `SELECT year, week FROM weekly
       WHERE user_id = ? AND content <> '' AND TRIM(content) <> ''
       ORDER BY year, week`,
    )
    .all(userId) as WeekRef[];

/**
 * 按 ISO 周序号区间批量取「已写」周报（批量导出用）
 * @param userId - 用户 ID，从会话推导，禁止来自前端
 * @param fromYear - 起始 ISO 年
 * @param fromWeek - 起始 ISO 周次
 * @param toYear - 结束 ISO 年
 * @param toWeek - 结束 ISO 周次
 * @returns 区间内全部已写周报，按年、周升序；闭区间
 * @remarks 红线 1：WHERE 必须带 user_id，否则导出会把别人的周报一起读出来。
 * 区间比较用「年 × 100 + 周」的合序号而不是 (year, week) 元组：合序号在同年内是连续的，
 * 跨年时也只需一次 BETWEEN 就能表达闭区间，不会出现 (2026, 1) 小于 (2025, 53) 这类元组比较陷阱。
 * 「已写」口径与 listWrittenWeeks 完全一致：内容去空白后非空。
 */
export const listWrittenWeeklyInRange = (
  userId: number,
  fromYear: number,
  fromWeek: number,
  toYear: number,
  toWeek: number,
): WeeklyRow[] =>
  db
    .prepare(
      `SELECT * FROM weekly
       WHERE user_id = ?
         AND content <> '' AND TRIM(content) <> ''
         AND year * 100 + week BETWEEN ? AND ?
       ORDER BY year, week`,
    )
    .all(userId, fromYear * 100 + fromWeek, toYear * 100 + toWeek) as WeeklyRow[];
