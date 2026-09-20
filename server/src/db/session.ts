import { db } from './index';
import type { SessionRow } from '../types/models';

/**
 * 创建会话
 * @param userId - 归属用户 ID
 * @param token - 会话令牌（必须由 crypto.randomBytes 生成）
 * @param expiresAt - 过期时间，ISO 8601 字符串，必须与 Cookie maxAge 一致
 * @returns 无
 */
export const createSession = (userId: number, token: string, expiresAt: string): void => {
  db.prepare(
    'INSERT INTO session (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
  ).run(token, userId, new Date().toISOString(), expiresAt);
};

/**
 * 查询有效会话
 * @param userId - 归属用户 ID，必须传入
 * @param token - 会话令牌
 * @returns 会话行；不存在或已过期时返回 undefined
 * @remarks 过期判断写在 SQL 里，避免调用方忘记校验 expires_at。
 */
export const findValidSession = (
  userId: number,
  token: string,
): SessionRow | undefined =>
  db
    .prepare('SELECT * FROM session WHERE token = ? AND user_id = ? AND expires_at > ?')
    .get(token, userId, new Date().toISOString()) as SessionRow | undefined;

/**
 * 按令牌查询会话（供鉴权中间件推导 userId 用）
 * @param token - 会话令牌
 * @returns 会话行；不存在或已过期时返回 undefined
 */
export const findValidSessionByToken = (token: string): SessionRow | undefined =>
  db
    .prepare('SELECT * FROM session WHERE token = ? AND expires_at > ?')
    .get(token, new Date().toISOString()) as SessionRow | undefined;

/**
 * 删除单个会话（登出）
 * @param userId - 归属用户 ID，必须传入
 * @param token - 会话令牌
 * @returns 是否删除成功（false 表示会话不存在或不属于该用户）
 */
export const deleteSession = (userId: number, token: string): boolean => {
  const result = db
    .prepare('DELETE FROM session WHERE token = ? AND user_id = ?')
    .run(token, userId);
  return result.changes > 0;
};

/**
 * 删除某用户的全部会话（登出所有设备）
 * @param userId - 归属用户 ID，必须传入
 * @returns 删除的会话条数
 */
export const deleteSessionsByUser = (userId: number): number =>
  db.prepare('DELETE FROM session WHERE user_id = ?').run(userId).changes;

/**
 * 删除某用户除当前会话外的所有会话（修改密码后踢掉其他设备）
 * @param userId - 归属用户 ID，必须传入
 * @param keepToken - 需要保留的当前会话令牌
 * @returns 删除的会话条数
 */
export const deleteOtherSessions = (userId: number, keepToken: string): number =>
  db
    .prepare('DELETE FROM session WHERE user_id = ? AND token <> ?')
    .run(userId, keepToken).changes;

/**
 * 清理某用户的过期会话
 * @param userId - 归属用户 ID，必须传入
 * @returns 清理的会话条数
 * @remarks 登录时顺手调用，不引入定时任务。
 */
export const deleteExpiredSessions = (userId: number): number =>
  db
    .prepare('DELETE FROM session WHERE user_id = ? AND expires_at <= ?')
    .run(userId, new Date().toISOString()).changes;
