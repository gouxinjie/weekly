import { randomBytes } from 'node:crypto';
import { config } from '../config';

/**
 * 生成会话令牌（256 位随机）
 * @returns 64 位十六进制字符串
 * @remarks 必须使用 crypto.randomBytes，禁止 Math.random()——后者不是密码学安全随机数。
 */
export const createToken = (): string => randomBytes(32).toString('hex');

/**
 * 计算会话过期时间
 * @returns ISO 8601 时间字符串
 * @remarks 必须与 Cookie 的 maxAge 保持一致（同为 config.sessionDays 天），
 * 否则会出现「Cookie 还在但会话已过期」或相反的情况。
 */
export const createExpiresAt = (): string =>
  new Date(Date.now() + config.sessionDays * 24 * 60 * 60 * 1000).toISOString();
