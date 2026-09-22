import { db } from './index';
import type { TodoRow } from '../types/models';

/**
 * 列出某用户的全部待办
 * @param userId - 用户 ID，必须传入
 * @returns 待办行列表，按「置顶优先、手动排序、创建先后」排序
 * @remarks sort_order 相同时（老数据或新条目尚未被拖动过）回落到 id 先后，保证顺序稳定。
 */
export const listTodos = (userId: number): TodoRow[] =>
  db
    .prepare(
      'SELECT * FROM todo WHERE user_id = ? ORDER BY pinned DESC, sort_order ASC, id ASC',
    )
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
 * @returns 待办行列表，按「置顶优先、未完成在前、手动排序、创建先后」排序
 * @remarks 排序必须显式带上 pinned 与 done：拖拽只重排「同一周分组的同一状态段」，
 *          序号在段内从 1 重新分配，于是不同段的序号会撞车（例如已完成段重排后是 1、2，
 *          未完成段本来就是 1、2）。只按 sort_order 排会把已完成条目插进未完成条目中间，
 *          右栏于是出现「待办夹着已完成」的错序。
 */
export const listTodosByWeek = (userId: number, year: number, week: number): TodoRow[] =>
  db
    .prepare(
      `SELECT * FROM todo
       WHERE user_id = ? AND year = ? AND week = ?
       ORDER BY pinned DESC, done ASC, sort_order ASC, id ASC`,
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

  // 新条目取当前最大序号 + 1，落在同组末尾；不能固定用 0，
  // 否则拖动排序（序号从 1 起）之后新建的条目会插到最前面
  const maxRow = db
    .prepare('SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM todo WHERE user_id = ?')
    .get(userId) as { max_order: number };

  const result = db
    .prepare(
      `INSERT INTO todo
         (user_id, text, done, pinned, year, week, category, sort_order, created_at, updated_at)
       VALUES (?, ?, 0, 0, ?, ?, ?, ?, ?, ?)`,
    )
    .run(userId, text, year, week, category, maxRow.max_order + 1, now, now);

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
 * 按给定顺序重排若干待办（M-05 拖拽排序）
 * @param userId - 用户 ID，必须传入
 * @param ids - 同一分组内拖拽后的待办 ID 顺序，序号按数组下标从 1 重新分配
 * @returns 是否全部成功（false 表示有记录不存在或不属于该用户，此时整体回滚）
 * @remarks 红线 1：每条 UPDATE 都写成 `WHERE id = ? AND user_id = ?`。
 *          只要有一条 changes 为 0 就抛错回滚，避免出现「改了一半」的半成品顺序。
 */
export const reorderTodos = (userId: number, ids: number[]): boolean => {
  const now = new Date().toISOString();
  const stmt = db.prepare(
    'UPDATE todo SET sort_order = ?, updated_at = ? WHERE id = ? AND user_id = ?',
  );

  const apply = db.transaction((list: number[]): void => {
    list.forEach((id, index) => {
      if (stmt.run(index + 1, now, id, userId).changes === 0) {
        throw new Error('待办不存在或不属于当前用户');
      }
    });
  });

  try {
    apply(ids);
    return true;
  } catch {
    return false;
  }
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
