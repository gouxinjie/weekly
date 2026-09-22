import { db } from './index';
import type { TodoRow } from '../types/models';

/**
 * 列出某用户的全部待办
 * @param userId - 用户 ID，必须传入
 * @returns 待办行列表，按「置顶优先、创建先后」排序
 */
export const listTodos = (userId: number): TodoRow[] =>
  db
    .prepare('SELECT * FROM todo WHERE user_id = ? ORDER BY pinned DESC, id ASC')
    .all(userId) as TodoRow[];

/**
 * 查询单条待办
 * @param userId - 用户 ID，必须传入
 * @param id - 待办 ID
 * @returns 待办行；不存在或不属于该用户时返回 undefined
 */
export const findTodo = (userId: number, id: number): TodoRow | undefined =>
  db.prepare('SELECT * FROM todo WHERE id = ? AND user_id = ?').get(id, userId) as
    | TodoRow
    | undefined;

/**
 * 列出标记到指定周次的待办（周报右栏「本周待办」数据来源）
 * @param userId - 用户 ID，必须传入
 * @param year - ISO 年
 * @param week - ISO 周次
 * @returns 待办行列表，按创建先后排序
 */
export const listTodosByWeek = (userId: number, year: number, week: number): TodoRow[] =>
  db
    .prepare(
      'SELECT * FROM todo WHERE user_id = ? AND year = ? AND week = ? ORDER BY id ASC',
    )
    .all(userId, year, week) as TodoRow[];

/**
 * 新建待办
 * @param userId - 用户 ID，必须传入
 * @param text - 待办文本
 * @param year - 可选标记的 ISO 年，未标记传 null
 * @param week - 可选标记的 ISO 周次，未标记传 null
 * @param category - 分类标识，空串表示未分类，缺省为 ''
 * @returns 新建的待办行
 */
export const insertTodo = (
  userId: number,
  text: string,
  year: number | null,
  week: number | null,
  category = '',
): TodoRow => {
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO todo (user_id, text, done, pinned, year, week, category, created_at, updated_at)
       VALUES (?, ?, 0, 0, ?, ?, ?, ?, ?)`,
    )
    .run(userId, text, year, week, category, now, now);

  const created = findTodo(userId, Number(result.lastInsertRowid));
  if (!created) {
    throw new Error('待办创建失败');
  }
  return created;
};

/**
 * 更新待办（全量字段提交，SQL 固定且全参数化）
 * @param userId - 用户 ID，必须传入
 * @param id - 待办 ID
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
export const updateTodo = (
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
      `UPDATE todo
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
 * 删除待办
 * @param userId - 用户 ID，必须传入
 * @param id - 待办 ID
 * @returns 是否删除成功（false 表示记录不存在或不属于该用户）
 * @remarks 红线 1：WHERE 必须同时带 id 与 user_id，删别人的记录必须失败。
 */
export const deleteTodo = (userId: number, id: number): boolean => {
  const result = db.prepare('DELETE FROM todo WHERE id = ? AND user_id = ?').run(id, userId);
  return result.changes > 0;
};

/**
 * 统计某用户未完成的待办条数
 * @param userId - 用户 ID，必须传入
 * @returns 未完成条数
 */
export const countUndoneTodos = (userId: number): number => {
  const row = db
    .prepare('SELECT COUNT(*) AS total FROM todo WHERE user_id = ? AND done = 0')
    .get(userId) as { total: number };
  return row.total;
};
