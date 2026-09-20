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
 * 统计某用户已写的周数
 * @param userId - 用户 ID，必须传入
 * @returns 已写周数
 */
export const countWrittenWeeks = (userId: number): number => {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS total FROM weekly
       WHERE user_id = ? AND content <> '' AND TRIM(content) <> ''`,
    )
    .get(userId) as { total: number };
  return row.total;
};
