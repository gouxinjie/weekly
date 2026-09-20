import { db } from './index';
import type { MemoRow } from '../types/models';

/**
 * 列出某用户的全部备忘
 * @param userId - 用户 ID，必须传入
 * @returns 备忘行列表，按「置顶优先、创建先后」排序
 */
export const listMemos = (userId: number): MemoRow[] =>
  db
    .prepare('SELECT * FROM memo WHERE user_id = ? ORDER BY pinned DESC, id ASC')
    .all(userId) as MemoRow[];

/**
 * 查询单条备忘
 * @param userId - 用户 ID，必须传入
 * @param id - 备忘 ID
 * @returns 备忘行；不存在或不属于该用户时返回 undefined
 */
export const findMemo = (userId: number, id: number): MemoRow | undefined =>
  db.prepare('SELECT * FROM memo WHERE id = ? AND user_id = ?').get(id, userId) as
    | MemoRow
    | undefined;

/**
 * 列出标记到指定周次的备忘（周报右栏「本周参考」数据来源）
 * @param userId - 用户 ID，必须传入
 * @param year - ISO 年
 * @param week - ISO 周次
 * @returns 备忘行列表，按创建先后排序
 */
export const listMemosByWeek = (userId: number, year: number, week: number): MemoRow[] =>
  db
    .prepare(
      'SELECT * FROM memo WHERE user_id = ? AND year = ? AND week = ? ORDER BY id ASC',
    )
    .all(userId, year, week) as MemoRow[];

/**
 * 新建备忘
 * @param userId - 用户 ID，必须传入
 * @param text - 待办文本
 * @param year - 可选标记的 ISO 年，未标记传 null
 * @param week - 可选标记的 ISO 周次，未标记传 null
 * @param category - 分类标识，空串表示未分类，缺省为 ''
 * @returns 新建的备忘行
 */
export const insertMemo = (
  userId: number,
  text: string,
  year: number | null,
  week: number | null,
  category = '',
): MemoRow => {
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO memo (user_id, text, done, pinned, year, week, category, created_at, updated_at)
       VALUES (?, ?, 0, 0, ?, ?, ?, ?, ?)`,
    )
    .run(userId, text, year, week, category, now, now);

  const created = findMemo(userId, Number(result.lastInsertRowid));
  if (!created) {
    throw new Error('备忘创建失败');
  }
  return created;
};

/**
 * 更新备忘（全量字段提交，SQL 固定且全参数化）
 * @param userId - 用户 ID，必须传入
 * @param id - 备忘 ID
 * @param text - 待办文本
 * @param done - 是否完成
 * @param pinned - 是否置顶
 * @param year - 标记的 ISO 年，取消标记传 null
 * @param week - 标记的 ISO 周次，取消标记传 null
 * @param category - 分类标识，空串表示未分类，缺省为 ''
 * @returns 是否更新成功（false 表示记录不存在或不属于该用户）
 * @remarks 红线 1：WHERE 必须同时带 id 与 user_id，用 changes 判断真实影响行数，
 * 让「改别人的记录」在 API 层表现为失败，而不是静默成功。
 */
export const updateMemo = (
  userId: number,
  id: number,
  text: string,
  done: boolean,
  pinned: boolean,
  year: number | null,
  week: number | null,
  category = '',
): boolean => {
  const result = db
    .prepare(
      `UPDATE memo
       SET text = ?, done = ?, pinned = ?, year = ?, week = ?, category = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    )
    .run(
      text,
      done ? 1 : 0,
      pinned ? 1 : 0,
      year,
      week,
      category,
      new Date().toISOString(),
      id,
      userId,
    );
  return result.changes > 0;
};

/**
 * 删除备忘
 * @param userId - 用户 ID，必须传入
 * @param id - 备忘 ID
 * @returns 是否删除成功（false 表示记录不存在或不属于该用户）
 * @remarks 红线 1：WHERE 必须同时带 id 与 user_id，删别人的记录必须失败。
 */
export const deleteMemo = (userId: number, id: number): boolean => {
  const result = db.prepare('DELETE FROM memo WHERE id = ? AND user_id = ?').run(id, userId);
  return result.changes > 0;
};

/**
 * 统计某用户未完成的备忘条数
 * @param userId - 用户 ID，必须传入
 * @returns 未完成条数
 */
export const countUndoneMemos = (userId: number): number => {
  const row = db
    .prepare('SELECT COUNT(*) AS total FROM memo WHERE user_id = ? AND done = 0')
    .get(userId) as { total: number };
  return row.total;
};
