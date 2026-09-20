import { db } from './index';
import { createSession } from './session';
import type { UserRow } from '../types/models';

/**
 * 按手机号查询用户
 * @param phone - 手机号
 * @returns 用户行，不存在时返回 undefined
 */
export const findUserByPhone = (phone: string): UserRow | undefined =>
  db.prepare('SELECT * FROM user WHERE phone = ?').get(phone) as UserRow | undefined;

/**
 * 按用户 ID 查询用户
 * @param userId - 用户 ID
 * @returns 用户行，不存在时返回 undefined
 */
export const findUserById = (userId: number): UserRow | undefined =>
  db.prepare('SELECT * FROM user WHERE id = ?').get(userId) as UserRow | undefined;

/**
 * 新增用户
 * @param phone - 手机号（唯一）
 * @param passwordHash - argon2 哈希后的密码
 * @returns 新用户的自增主键
 * @throws 手机号已存在时抛出 SQLITE_CONSTRAINT_UNIQUE
 */
export const insertUser = (phone: string, passwordHash: string): number => {
  const result = db
    .prepare('INSERT INTO user (phone, password_hash, created_at) VALUES (?, ?, ?)')
    .run(phone, passwordHash, new Date().toISOString());
  return Number(result.lastInsertRowid);
};

/**
 * 更新指定用户的密码哈希
 * @param userId - 用户 ID，必须传入
 * @param passwordHash - 新的 argon2 哈希串
 * @returns 是否更新成功（false 表示不存在该用户）
 */
export const updateUserPassword = (userId: number, passwordHash: string): boolean => {
  const result = db
    .prepare('UPDATE user SET password_hash = ? WHERE id = ?')
    .run(passwordHash, userId);
  return result.changes > 0;
};

/**
 * 注册事务：写 user 表 + 写 session 表
 * 说明：better-sqlite3 是同步 API，事务函数在模块加载时创建一次，调用时执行。
 */
const registerTransaction = db.transaction(
  (phone: string, passwordHash: string, token: string, expiresAt: string): number => {
    const userId = insertUser(phone, passwordHash);
    createSession(userId, token, expiresAt);
    return userId;
  },
);

/**
 * 注册用户并创建首个会话（原子操作）
 * @param phone - 手机号（唯一）
 * @param passwordHash - argon2 哈希后的密码
 * @param token - 会话令牌
 * @param expiresAt - 会话过期时间
 * @returns 新用户的自增主键
 * @throws 手机号重复或数据库异常时整体回滚
 */
export const registerUser = (
  phone: string,
  passwordHash: string,
  token: string,
  expiresAt: string,
): number => registerTransaction(phone, passwordHash, token, expiresAt);
