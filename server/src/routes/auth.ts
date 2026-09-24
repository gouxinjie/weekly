import type { FastifyInstance, FastifyPluginAsync, FastifySchema } from 'fastify';
import { config } from '../config';
import { PHONE_PATTERN, SESSION_COOKIE_NAME } from '../constants';
import {
  createSession,
  deleteExpiredSessions,
  deleteOtherSessions,
  deleteSession,
  deleteSessionsByUser,
} from '../db/session';
import { findUserByPhone, registerUser, updateUserPassword } from '../db/user';
import { recordAttempt } from '../db/loginAttempt';
import { requireAuth } from '../middleware/session';
import {
  checkLoginRateLimit,
  checkRegisterRateLimit,
  getClientIp,
} from '../middleware/rateLimit';
import { hashPassword, isStrongPassword, verifyPassword } from '../utils/password';
import { createExpiresAt, createToken } from '../utils/token';
import { ERROR_CODES, fail, internalError, ok } from '../utils/response';
import type { ChangePasswordBody, CredentialsBody, UserDto } from '../types/api';

/**
 * 注册 / 登录请求体校验
 * 用工厂函数返回新对象：同一 schema 对象被多个路由复用时 ajv 会因重复 $id 报错。
 * @returns 请求体 JSON Schema
 */
const credentialsSchema = (): FastifySchema => ({
  body: {
    type: 'object',
    required: ['phone', 'password'],
    additionalProperties: false,
    properties: {
      phone: { type: 'string', pattern: PHONE_PATTERN },
      password: { type: 'string', minLength: 1, maxLength: 128 },
    },
  },
});

/** 修改密码请求体校验 */
const changePasswordSchema: FastifySchema = {
  body: {
    type: 'object',
    required: ['oldPassword', 'newPassword'],
    additionalProperties: false,
    properties: {
      oldPassword: { type: 'string', minLength: 1, maxLength: 128 },
      newPassword: { type: 'string', minLength: 1, maxLength: 128 },
    },
  },
};

/** 鉴权相关路由（注册 / 登录 / 登出 / 改密） */
export const authRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  /** 注册：手机号 + 密码，入口长期开放 */
  app.post<{ Body: CredentialsBody }>(
    '/register',
    { schema: credentialsSchema() },
    async (request, reply) => {
      try {
        const ip = getClientIp(request);

        // 限流必须在任何业务判断之前，防批量灌水
        const limited = checkRegisterRateLimit(ip);
        if (!limited.allowed) {
          recordAttempt('register', 'ip', ip, false);
          return reply.code(429).send(fail(ERROR_CODES.RATE_LIMITED, limited.message));
        }

        const { phone, password } = request.body;

        // 密码强度必须服务端再校验一遍，前端校验只是体验，可被绕过
        if (!isStrongPassword(password)) {
          recordAttempt('register', 'ip', ip, false);
          return reply
            .code(400)
            .send(fail(ERROR_CODES.WEAK_PASSWORD, '密码需包含数字与字母，且长度不少于 6 位'));
        }

        if (findUserByPhone(phone)) {
          recordAttempt('register', 'ip', ip, false);
          return reply.code(409).send(fail(ERROR_CODES.PHONE_EXISTS, '该手机号已注册'));
        }

        const passwordHash = await hashPassword(password);
        const token = createToken();
        const expiresAt = createExpiresAt();

        // 写 user 表 + 写 session 表放在同一个事务里
        const userId = registerUser(phone, passwordHash, token, expiresAt);

        // 注册成功同样计数，否则挡不住批量灌水
        recordAttempt('register', 'ip', ip, true);
        reply.setCookie(SESSION_COOKIE_NAME, token, { ...config.sessionCookie });

        const data: UserDto = { id: userId, phone };
        return reply.code(201).send(ok(data, '注册成功'));
      } catch (error) {
        request.log.error({ err: error }, '注册失败');
        return reply.code(500).send(internalError());
      }
    },
  );

  /** 登录：失败提示统一为「手机号或密码错误」，不区分账号是否存在，防手机号枚举 */
  app.post<{ Body: CredentialsBody }>(
    '/login',
    { schema: credentialsSchema() },
    async (request, reply) => {
      try {
        const ip = getClientIp(request);
        const { phone, password } = request.body;

        // 限流：按手机号与 IP 双维度，且必须在密码校验之前
        const limited = checkLoginRateLimit(phone, ip);
        if (!limited.allowed) {
          recordAttempt('login', 'phone', phone, false);
          recordAttempt('login', 'ip', ip, false);
          return reply.code(429).send(fail(ERROR_CODES.RATE_LIMITED, limited.message));
        }

        const user = findUserByPhone(phone);
        if (!user || !(await verifyPassword(user.password_hash, password))) {
          recordAttempt('login', 'phone', phone, false);
          recordAttempt('login', 'ip', ip, false);
          return reply
            .code(401)
            .send(fail(ERROR_CODES.INVALID_CREDENTIALS, '手机号或密码错误'));
        }

        // 登录时顺手清掉该用户的过期会话，不引入定时任务
        deleteExpiredSessions(user.id);

        const token = createToken();
        createSession(user.id, token, createExpiresAt());

        recordAttempt('login', 'phone', phone, true);
        recordAttempt('login', 'ip', ip, true);
        reply.setCookie(SESSION_COOKIE_NAME, token, { ...config.sessionCookie });

        const data: UserDto = { id: user.id, phone: user.phone };
        return reply.send(ok(data, '登录成功'));
      } catch (error) {
        request.log.error({ err: error }, '登录失败');
        return reply.code(500).send(internalError());
      }
    },
  );

  /** 当前登录用户 */
  app.get('/me', { preHandler: requireAuth }, async (request, reply) => {
    try {
      const data: UserDto = {
        id: request.currentUser.id,
        phone: request.currentUser.phone,
      };
      return reply.send(ok(data, '获取成功'));
    } catch (error) {
      request.log.error({ err: error }, '获取当前用户失败');
      return reply.code(500).send(internalError());
    }
  });

  /** 登出当前设备：只删除当前会话 */
  app.post('/logout', { preHandler: requireAuth }, async (request, reply) => {
    try {
      deleteSession(request.userId, request.sessionToken);
      reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
      return reply.send(ok(null, '已登出'));
    } catch (error) {
      request.log.error({ err: error }, '登出失败');
      return reply.code(500).send(internalError());
    }
  });

  /** 登出所有设备：清空该用户全部会话 */
  app.post('/logout-all', { preHandler: requireAuth }, async (request, reply) => {
    try {
      deleteSessionsByUser(request.userId);
      reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
      return reply.send(ok(null, '已登出所有设备'));
    } catch (error) {
      request.log.error({ err: error }, '登出所有设备失败');
      return reply.code(500).send(internalError());
    }
  });

  /** 修改密码：需验证原密码，成功后使其他设备会话失效 */
  app.post<{ Body: ChangePasswordBody }>(
    '/password',
    { preHandler: requireAuth, schema: changePasswordSchema },
    async (request, reply) => {
      try {
        const { oldPassword, newPassword } = request.body;

        if (!isStrongPassword(newPassword)) {
          return reply
            .code(400)
            .send(fail(ERROR_CODES.WEAK_PASSWORD, '新密码需包含数字与字母，且长度不少于 6 位'));
        }

        if (!(await verifyPassword(request.currentUser.password_hash, oldPassword))) {
          return reply
            .code(400)
            .send(fail(ERROR_CODES.OLD_PASSWORD_MISMATCH, '原密码不正确'));
        }

        const passwordHash = await hashPassword(newPassword);
        if (!updateUserPassword(request.userId, passwordHash)) {
          return reply.code(400).send(fail(ERROR_CODES.INVALID_PARAMS, '修改失败，请重新登录'));
        }

        // 踢掉其他设备，保留当前会话
        deleteOtherSessions(request.userId, request.sessionToken);
        return reply.send(ok(null, '密码已更新'));
      } catch (error) {
        request.log.error({ err: error }, '修改密码失败');
        return reply.code(500).send(internalError());
      }
    },
  );
};
