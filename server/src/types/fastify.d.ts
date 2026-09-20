import type { UserRow } from './models';

/**
 * Fastify 请求上下文扩展
 * 说明：userId 只允许由 requireAuth 中间件从会话推导后注入，
 * 业务代码一律读 request.userId，禁止从 query / body / header 取用户 ID。
 */
declare module 'fastify' {
  interface FastifyRequest {
    /** 当前会话所属用户 ID */
    userId: number;
    /** 当前会话令牌，登出与改密时用于保留当前会话 */
    sessionToken: string;
    /** 当前登录用户（含密码哈希，对外返回前必须裁剪） */
    currentUser: UserRow;
  }
}
