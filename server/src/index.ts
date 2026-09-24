import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import type { FastifyError } from 'fastify';
import { config } from './config';
import { migrate } from './db/index';
import { authRoutes } from './routes/auth';
import { noteRoutes } from './routes/note';
import { todoRoutes } from './routes/todo';
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

  /*
   * 统一错误处理必须在注册路由之前挂上：路由在注册时会捕获当时的错误处理器，
   * 晚于 register 挂的话这些路由仍会走 Fastify 默认错误体
   * （形如 { statusCode, code, error, message }，没有 success 字段），
   * 前端一律按统一响应体解析，会把「参数校验失败」误报成「接口返回格式异常」。
   */
  app.setErrorHandler((error: FastifyError, request, reply) => {
    // 参数校验失败：统一为 INVALID_PARAMS，不透出 ajv 的字段级细节
    if (error.validation) {
      return reply.code(400).send(fail(ERROR_CODES.INVALID_PARAMS, '请求参数不合法'));
    }

    // 其余 4xx 属于请求侧问题（如请求体不是合法 JSON），同样走统一响应体
    const status = error.statusCode ?? 500;
    if (status < 500) {
      request.log.warn({ err: error }, '请求被拒绝');
      return reply.code(status).send(fail(ERROR_CODES.INVALID_PARAMS, '请求格式不合法'));
    }

    request.log.error({ err: error }, '未捕获的服务异常');
    return reply.code(status).send(internalError());
  });

  await app.register(cookie);

  /**
   * 健康检查：供部署后验证使用
   * 除存活标记外还回显时间轴起点与周次上限：前端产物里的起点是**构建期**注入的，
   * 后端是**运行期**读 .env，发布包又不含 .env，两者因此可能不同步。
   * 回显出来，发布后 `curl /api/health` 比对一次即可发现
   * （漏改服务器 .env 的症状是界面能点开某周、保存却报「周次超出有效范围」）。
   */
  app.get('/api/health', async (_request, reply) => {
    const data: HealthDto = {
      ok: true,
      startYear: config.startYear,
      maxWeek: config.maxWeek,
    };
    return reply.send(data);
  });

  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(weeklyRoutes, { prefix: '/api/weekly' });
  await app.register(todoRoutes, { prefix: '/api/todo' });
  await app.register(noteRoutes, { prefix: '/api/notes' });

  await app.listen({ port: config.port, host: config.host });
};

start().catch((error: unknown) => {
  // 启动阶段失败必须立刻退出，避免带着坏配置继续提供服务
  app.log.error({ err: error }, '服务启动失败');
  process.exit(1);
});
