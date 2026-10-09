import type { FastifyInstance, FastifyPluginAsync, FastifySchema } from 'fastify';
import { requireAuth } from '../middleware/session';
import {
  findWeekly,
  listWrittenWeeklyInRange,
  listWrittenWeeks,
  upsertWeekly,
} from '../db/weekly';
import { countWeeksBetween, getWeekRange, isValidWeek } from '../utils/week';
import { EXPORT_MAX_WEEKS } from '../constants';
import { ERROR_CODES, fail, internalError, ok } from '../utils/response';
import type { SaveWeeklyBody, WeeklyDto, WeeklyExportDto } from '../types/api';
import type { WeeklyRow } from '../types/models';

/**
 * 路径参数校验：year 为 4 位数字，week 为 1-2 位数字
 * 用工厂函数返回新对象：同一 schema 对象被多个路由复用时 ajv 会因重复编译报错。
 * @returns 路径参数 JSON Schema
 */
const weekParamsSchema = (): FastifySchema => ({
  params: {
    type: 'object',
    required: ['year', 'week'],
    additionalProperties: false,
    properties: {
      year: { type: 'string', pattern: '^\\d{4}$' },
      week: { type: 'string', pattern: '^\\d{1,2}$' },
    },
  },
});

/** 周报保存请求体校验 */
const saveWeeklySchema = (): FastifySchema => ({
  body: {
    type: 'object',
    required: ['content'],
    additionalProperties: false,
    properties: {
      content: { type: 'string', maxLength: 200000 },
    },
  },
});

/** 批量导出查询参数校验：四个周次维度都按数字字符串收，语义校验另走 isValidWeek */
const exportQuerySchema = (): FastifySchema => ({
  querystring: {
    type: 'object',
    required: ['fromYear', 'fromWeek', 'toYear', 'toWeek'],
    additionalProperties: false,
    properties: {
      fromYear: { type: 'string', pattern: '^\\d{4}$' },
      fromWeek: { type: 'string', pattern: '^\\d{1,2}$' },
      toYear: { type: 'string', pattern: '^\\d{4}$' },
      toWeek: { type: 'string', pattern: '^\\d{1,2}$' },
    },
  },
});

/**
 * 把数据库行转换为接口出参
 * @param row - 周报行，未写过时为 undefined
 * @param year - ISO 年
 * @param week - ISO 周次
 * @returns 周报出参，未写过时 content 为空字符串
 */
const toWeeklyDto = (row: WeeklyRow | undefined, year: number, week: number): WeeklyDto => {
  const range = getWeekRange(year, week);
  return {
    year,
    week,
    weekStart: row?.week_start ?? range.start,
    weekEnd: row?.week_end ?? range.end,
    content: row?.content ?? '',
    updatedAt: row?.updated_at ?? '',
  };
};

/** 周报相关路由（全部需要登录） */
export const weeklyRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', requireAuth);

  /** 列出当前用户所有「已写」的周次，用于树节点状态角标 */
  app.get('/written', async (request, reply) => {
    try {
      return reply.send(ok(listWrittenWeeks(request.userId), '获取成功'));
    } catch (error) {
      request.log.error({ err: error }, '查询已写周次失败');
      return reply.code(500).send(internalError());
    }
  });

  /**
   * 批量导出：取指定周区间内全部「已写」周报
   * @remarks 与 '/written' 一样是单段静态路径，段数与两段的 '/:year/:week' 不同，本不会互相抢匹配；
   * 仍按「静态路由先于参数路由注册」的惯例放在它前面，避免日后新增单段参数路由时被打乱。
   * 区间是闭区间，起止顺序与跨度都按「周」计算（红线 3）；起点与上限校验复用 isValidWeek。
   */
  app.get<{
    Querystring: { fromYear: string; fromWeek: string; toYear: string; toWeek: string };
  }>('/export', { schema: exportQuerySchema() }, async (request, reply) => {
    try {
      const from = {
        year: Number(request.query.fromYear),
        week: Number(request.query.fromWeek),
      };
      const to = {
        year: Number(request.query.toYear),
        week: Number(request.query.toWeek),
      };

      if (!isValidWeek(from.year, from.week) || !isValidWeek(to.year, to.week)) {
        return reply
          .code(400)
          .send(fail(ERROR_CODES.WEEK_OUT_OF_RANGE, '周次超出有效范围'));
      }

      // 跨度与顺序都由真实周数推导：合序号相减在跨年处会虚增，不能用来做上限判定
      const weekSpan = countWeeksBetween(from.year, from.week, to.year, to.week);

      if (weekSpan === 0) {
        return reply
          .code(400)
          .send(fail(ERROR_CODES.INVALID_PARAMS, '起始周不能晚于结束周'));
      }

      if (weekSpan > EXPORT_MAX_WEEKS) {
        return reply
          .code(400)
          .send(
            fail(
              ERROR_CODES.INVALID_PARAMS,
              `单次导出最多覆盖 ${EXPORT_MAX_WEEKS} 周，请缩小范围`,
            ),
          );
      }

      const rows = listWrittenWeeklyInRange(
        request.userId,
        from.year,
        from.week,
        to.year,
        to.week,
      );
      const result: WeeklyExportDto = {
        items: rows.map((row) => toWeeklyDto(row, row.year, row.week)),
      };

      return reply.send(ok(result, '获取成功'));
    } catch (error) {
      request.log.error({ err: error }, '批量导出周报失败');
      return reply.code(500).send(internalError());
    }
  });

  /** 获取指定周报 */
  app.get<{ Params: { year: string; week: string } }>(
    '/:year/:week',
    { schema: weekParamsSchema() },
    async (request, reply) => {
      try {
        const year = Number(request.params.year);
        const week = Number(request.params.week);

        if (!isValidWeek(year, week)) {
          return reply
            .code(400)
            .send(fail(ERROR_CODES.WEEK_OUT_OF_RANGE, '周次超出有效范围'));
        }

        const row = findWeekly(request.userId, year, week);
        return reply.send(ok(toWeeklyDto(row, year, week), '获取成功'));
      } catch (error) {
        request.log.error({ err: error }, '获取周报失败');
        return reply.code(500).send(internalError());
      }
    },
  );

  /** 保存指定周报（不存在则新建） */
  app.put<{ Params: { year: string; week: string }; Body: SaveWeeklyBody }>(
    '/:year/:week',
    { schema: { ...weekParamsSchema(), ...saveWeeklySchema() } },
    async (request, reply) => {
      try {
        const year = Number(request.params.year);
        const week = Number(request.params.week);

        // 红线 3：服务端强制校验起点，不能只靠前端不显示
        if (!isValidWeek(year, week)) {
          return reply
            .code(400)
            .send(fail(ERROR_CODES.WEEK_OUT_OF_RANGE, '周次超出有效范围'));
        }

        const range = getWeekRange(year, week);
        const saved = upsertWeekly(
          request.userId,
          year,
          week,
          range.start,
          range.end,
          request.body.content,
        );

        return reply.send(ok(toWeeklyDto(saved, year, week), '已保存'));
      } catch (error) {
        request.log.error({ err: error }, '保存周报失败');
        return reply.code(500).send(internalError());
      }
    },
  );
};
