import argon2 from 'argon2';
import { PASSWORD_MIN_LENGTH } from '../constants';

/**
 * 哈希密码
 * @param plain - 明文密码
 * @returns argon2 哈希串
 * @throws 当 argon2 计算失败时抛出
 * @remarks 禁止存明文，禁止使用 MD5 / SHA1 / SHA256 等快哈希存密码。
 */
export const hashPassword = (plain: string): Promise<string> => argon2.hash(plain);

/**
 * 校验密码
 * @param hash - 数据库中的 argon2 哈希串
 * @param plain - 待校验的明文密码
 * @returns 是否匹配
 * @remarks 显式判断返回值；哈希串损坏时按「不匹配」处理，不向上抛异常，
 * 避免因历史脏数据把「密码错误」暴露成 500 之外的其他信息。
 */
export const verifyPassword = async (hash: string, plain: string): Promise<boolean> => {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
};

/**
 * 校验密码强度：必须同时含数字与字母，长度 ≥ 8
 * @param plain - 明文密码
 * @returns 是否通过
 * @remarks 前端校验只是体验，服务端必须再校验一遍，否则可被直接绕过。
 */
export const isStrongPassword = (plain: string): boolean =>
  plain.length >= PASSWORD_MIN_LENGTH && /[0-9]/.test(plain) && /[a-zA-Z]/.test(plain);
