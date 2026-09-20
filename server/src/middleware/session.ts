import type { FastifyReply, FastifyRequest } from 'fastify';
import { SESSION_COOKIE_NAME } from '../constants';
import { findUserById } from '../db/user';
import { findValidSessionByToken } from '../db/session';
import { unauthorized } from '../utils/response';

/**
 * 会话校验中间件
 * @param request - Fastify 请求对象
 * @param reply - Fastify 响应对象
 * @returns 校验通过时无返回；失败时已发送 401 响应
 * @remarks 这里是全系统唯一允许「先按 token 查库再得到 userId」的位置：
 * 鉴权入口必须先由 token 推导身份，之后的每一次业务查询都必须显式传入得到的 userId。
 * 失败一律返回同一种 401，不区分「token 不存在」与「已过期」，避免向攻击者泄露信息。
 */
export const requireAuth = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const token = request.cookies[SESSION_COOKIE_NAME];
  if (!token) {
    await reply.code(401).send(unauthorized());
    return;
  }

  const session = findValidSessionByToken(token);
  if (!session) {
    await reply.code(401).send(unauthorized());
    return;
  }

  const user = findUserById(session.user_id);
  if (!user) {
    await reply.code(401).send(unauthorized());
    return;
  }

  // 后续所有 db 调用都从这里取 userId，绝不从 query / body / header 读取
  request.userId = session.user_id;
  request.sessionToken = token;
  request.currentUser = user;
};
