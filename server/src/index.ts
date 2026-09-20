import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import type { FastifyError } from 'fastify';
import { config } from './config';
import { migrate } from './db/index';
import { authRoutes } from './routes/auth';
import { memoRoutes } from './routes/memo';
import { weeklyRoutes } from './routes/weekly';
import { ERROR_CODES, fail, internalError } from './utils/response';
import type { HealthDto } from './types/api';

/** Fastify 实例（日志不落请求体，避免密码与令牌进入日志） */
const app = Fastify({
  logger: { level: config.isProduction ? 'info' : 'debug' },

  // 经 Nginx 反代时依据 X-Forwarded-For 取真实 IP，否则限流会把所有用户算成同一个 IP
  trustProxy: true,

  ajv: {
    customOptions: {
      // Fastify 默认 removeAdditional: true 会静默丢弃多余字段，
      // 这里改成显式拒绝，保证「请求体里塞 user_id / id」这类试探直接报错而不是被忽略
      removeAdditional: false,

      // 关闭类型强转：默认的 coerceTypes 会把 null 静默转成 0，
      // 会让「取消周次标记」（year / week 传 null）被误判成越界的第 0 周
      coerceTypes: false,
    },
  },
});

/**
 * 启动服务
 * @returns 无
 * @throws 迁移或监听失败时抛出，由调用方记录并退出进程
 */
const start = async (): Promise<void> => {
  // 启动即执行迁移，保证新代码对外服务前表结构已就绪
  migrate();

  await app.register(cookie);

  /** 健康检查：供部署后验证使用，固定返回 { ok: true } */
  app.get('/api/health', async (_request, reply) => {
    const data: HealthDto = { ok: true };
    return reply.send(data);
  });

  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(weeklyRoutes, { prefix: '/api/weekly' });
  await app.register(memoRoutes, { prefix: '/api/memo' });

  // 统一错误处理：参数校验失败归为 400，其余异常一律 500 且不透出内部细节
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error.validation) {
      return reply.code(400).send(fail(ERROR_CODES.INVALID_PARAMS, '请求参数不合法'));
    }
    request.log.error({ err: error }, '未捕获的服务异常');
    return reply.code(error.statusCode ?? 500).send(internalError());
  });

  await app.listen({ port: config.port, host: config.host });
};

start().catch((error: unknown) => {
  // 启动阶段失败必须立刻退出，避免带着坏配置继续提供服务
  app.log.error({ err: error }, '服务启动失败');
  process.exit(1);
});
