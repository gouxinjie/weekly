import { db } from './index';
import type { NoteRow } from '../types/models';

/**
 * 列出某用户的全部便签
 * @param userId - 用户 ID，必须传入
 * @returns 便签行列表，按「置顶优先、新的在前」排序
 * @remarks 刻意不按 updated_at 排序：编辑会把 updated_at 刷新，边打字边跳位的列表没法用。
 *          按 id 倒序则新建的落在最前，且位置在编辑过程中始终稳定。
 */
export const listNotes = (userId: number): NoteRow[] =>
  db
    .prepare('SELECT * FROM note WHERE user_id = ? ORDER BY pinned DESC, id DESC')
    .all(userId) as NoteRow[];

/**
 * 查询单张便签
 * @param userId - 用户 ID，必须传入
 * @param id - 便签 ID
 * @returns 便签行；不存在或不属于该用户时返回 undefined
 */
export const findNote = (userId: number, id: number): NoteRow | undefined =>
  db.prepare('SELECT * FROM note WHERE id = ? AND user_id = ?').get(id, userId) as
    | NoteRow
    | undefined;

/**
 * 统计某用户的便签张数
 * @param userId - 用户 ID，必须传入
 * @returns 该用户的便签张数
 * @remarks 仅用于新建前的数量上限兜底（见 constants 的 NOTE_MAX_PER_USER）。
 */
export const countNotes = (userId: number): number => {
  const row = db
    .prepare('SELECT COUNT(*) AS total FROM note WHERE user_id = ?')
    .get(userId) as { total: number };
  return row.total;
};

/**
 * 新建便签
 * @param userId - 用户 ID，必须传入
 * @param content - 纯文本内容，允许为空串
 * @param color - 便签纸颜色标识，空串表示默认底色
 * @returns 新建的便签行
 */
export const insertNote = (userId: number, content = '', color = ''): NoteRow => {
  const now = new Date().toISOString();

  const result = db
    .prepare(
      `INSERT INTO note (user_id, content, color, pinned, created_at, updated_at)
       VALUES (?, ?, ?, 0, ?, ?)`,
    )
    .run(userId, content, color, now, now);

  const created = findNote(userId, Number(result.lastInsertRowid));
  if (!created) {
    throw new Error('便签创建失败');
  }
  return created;
};

/**
 * 更新便签（全量字段提交，SQL 固定且全参数化）
 * @param userId - 用户 ID，必须传入
 * @param id - 便签 ID
 * @param content - 纯文本内容
 * @param color - 便签纸颜色标识，空串表示默认底色
 * @param pinned - 是否置顶
 * @returns 是否更新成功（false 表示记录不存在或不属于该用户）
 * @remarks 红线 1：WHERE 必须同时带 id 与 user_id，用 changes 判断真实影响行数，
 * 让「改别人的记录」在 API 层表现为失败，而不是静默成功。
 */
export const updateNote = (
  userId: number,
  id: number,
  content: string,
  color: string,
  pinned: boolean,
): boolean => {
  const result = db
    .prepare(
      `UPDATE note
       SET content = ?, color = ?, pinned = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    )
    .run(content, color, pinned ? 1 : 0, new Date().toISOString(), id, userId);
  return result.changes > 0;
};

/**
 * 删除便签
 * @param userId - 用户 ID，必须传入
 * @param id - 便签 ID
 * @returns 是否删除成功（false 表示记录不存在或不属于该用户）
 * @remarks 红线 1：WHERE 必须同时带 id 与 user_id，删别人的记录必须失败。
 */
export const deleteNote = (userId: number, id: number): boolean => {
  const result = db.prepare('DELETE FROM note WHERE id = ? AND user_id = ?').run(id, userId);
  return result.changes > 0;
};
