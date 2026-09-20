import { db } from './index';

/** 限流行为范围 */
export type AttemptScope = 'login' | 'register';

/** 限流维度 */
export type AttemptDimension = 'phone' | 'ip';

/**
 * 记录一次尝试
 * @param scope - 行为范围：login / register
 * @param dimension - 限流维度：phone / ip
 * @param identifier - 维度取值（手机号或 IP）
 * @param success - 是否成功；注册成功同样需要计数，否则挡不住批量灌水
 * @returns 无
 */
export const recordAttempt = (
  scope: AttemptScope,
  dimension: AttemptDimension,
  identifier: string,
  success: boolean,
): void => {
  db.prepare(
    'INSERT INTO login_attempt (scope, dimension, identifier, success, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(scope, dimension, identifier, success ? 1 : 0, new Date().toISOString());
};

/**
 * 统计窗口内的失败次数
 * @param scope - 行为范围
 * @param dimension - 限流维度
 * @param identifier - 维度取值
 * @param sinceIso - 统计窗口起点，ISO 8601 字符串
 * @returns 失败次数
 */
export const countFailures = (
  scope: AttemptScope,
  dimension: AttemptDimension,
  identifier: string,
  sinceIso: string,
): number => {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS total FROM login_attempt
       WHERE scope = ? AND dimension = ? AND identifier = ? AND success = 0 AND created_at >= ?`,
    )
    .get(scope, dimension, identifier, sinceIso) as { total: number };
  return row.total;
};

/**
 * 统计窗口内的成功次数
 * @param scope - 行为范围
 * @param dimension - 限流维度
 * @param identifier - 维度取值
 * @param sinceIso - 统计窗口起点，ISO 8601 字符串
 * @returns 成功次数
 */
export const countSuccesses = (
  scope: AttemptScope,
  dimension: AttemptDimension,
  identifier: string,
  sinceIso: string,
): number => {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS total FROM login_attempt
       WHERE scope = ? AND dimension = ? AND identifier = ? AND success = 1 AND created_at >= ?`,
    )
    .get(scope, dimension, identifier, sinceIso) as { total: number };
  return row.total;
};

/**
 * 清理过期尝试记录
 * @param beforeIso - 清理该时间点之前的记录，ISO 8601 字符串
 * @returns 清理条数
 * @remarks 触发限流检查时顺手清理，避免表无限增长，不引入定时任务。
 */
export const cleanOldAttempts = (beforeIso: string): number =>
  db.prepare('DELETE FROM login_attempt WHERE created_at < ?').run(beforeIso).changes;
