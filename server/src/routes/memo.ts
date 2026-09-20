import type { FastifyInstance, FastifyPluginAsync, FastifySchema } from 'fastify';
import { requireAuth } from '../middleware/session';
import { deleteMemo, insertMemo, listMemos, listMemosByWeek, updateMemo } from '../db/memo';
import { isValidWeek } from '../utils/week';
import { ERROR_CODES, fail, internalError, ok } from '../utils/response';
import type { CreateMemoBody, MemoDto, UpdateMemoBody } from '../types/api';
import type { MemoRow } from '../types/models';

/**
 * 可空整数的 JSON Schema 片段
 * 每次调用返回新对象：同一 schema 对象被多处引用时 ajv 会因重复编译报错。
 * @returns 允许 integer 或 null 的 JSON Schema
 */
const nullableInteger = (): Record<string, unknown> => ({
  anyOf: [{ type: 'integer' }, { type: 'null' }],
});

/**
 * 新建备忘请求体校验
 * @returns 请求体 JSON Schema
 */
const createMemoSchema = (): FastifySchema => ({
  body: {
    type: 'object',
    required: ['text'],
    additionalProperties: false,
    properties: {
      text: { type: 'string', minLength: 1, maxLength: 500 },
      year: nullableInteger(),
      week: nullableInteger(),
    },
  },
});

/**
 * 更新备忘请求体校验（全量提交）
 * @returns 请求体 JSON Schema
 */
const updateMemoSchema = (): FastifySchema => ({
  body: {
    type: 'object',
    required: ['text', 'done', 'pinned', 'year', 'week'],
    additionalProperties: false,
    properties: {
      text: { type: 'string', minLength: 1, maxLength: 500 },
      done: { type: 'boolean' },
      pinned: { type: 'boolean' },
      year: nullableInteger(),
      week: nullableInteger(),
    },
  },
});

/**
 * 备忘 ID 路径参数校验
 * @returns 路径参数 JSON Schema
 */
const memoIdSchema = (): FastifySchema => ({
  params: {
    type: 'object',
    required: ['id'],
    additionalProperties: false,
    properties: {
      id: { type: 'string', pattern: '^\\d+$' },
    },
  },
});

/**
 * 周次路径参数校验
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

/** 周次标记 */
interface WeekTag {
  /** 标记的 ISO 年，未标记为 null */
  year: number | null;
  /** 标记的 ISO 周次，未标记为 null */
  week: number | null;
}

/**
 * 规范化周次标记：year / week 必须成对出现，只有一个有效时视为未标记
 * @param year - 入参年份，可能为 null 或 undefined
 * @param week - 入参周次，可能为 null 或 undefined
 * @returns 成对有效的周次标记或「未标记」
 */
const normalizeWeekTag = (
  year: number | null | undefined,
  week: number | null | undefined,
): WeekTag => {
  if (year === null || year === undefined || week === null || week === undefined) {
    return { year: null, week: null };
  }
  return { year, week };
};

/**
 * 把数据库行转换为接口出参
 * @param row - 备忘行
 * @returns 备忘出参
 */
const toMemoDto = (row: MemoRow): MemoDto => ({
  id: row.id,
  text: row.text,
  done: row.done === 1,
  pinned: row.pinned === 1,
  year: row.year,
  week: row.week,
  createdAt: row.created_at,
});

/** 备忘相关路由（全部需要登录） */
export const memoRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', requireAuth);

  /** 列出当前用户全部备忘 */
  app.get('/', async (request, reply) => {
    try {
      const list = listMemos(request.userId).map(toMemoDto);
      return reply.send(ok(list, '获取成功'));
    } catch (error) {
      request.log.error({ err: error }, '查询备忘失败');
      return reply.code(500).send(internalError());
    }
  });

  /** 列出标记到指定周的备忘（周报右栏「本周参考」） */
  app.get<{ Params: { year: string; week: string } }>(
    '/reference/:year/:week',
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

        const list = listMemosByWeek(request.userId, year, week).map(toMemoDto);
        return reply.send(ok(list, '获取成功'));
      } catch (error) {
        request.log.error({ err: error }, '查询本周参考失败');
        return reply.code(500).send(internalError());
      }
    },
  );

  /** 新建备忘 */
  app.post<{ Body: CreateMemoBody }>(
    '/',
    { schema: createMemoSchema() },
    async (request, reply) => {
      try {
        const text = request.body.text.trim();
        if (text === '') {
          return reply.code(400).send(fail(ERROR_CODES.INVALID_PARAMS, '待办内容不能为空'));
        }

        const tag = normalizeWeekTag(request.body.year, request.body.week);
        if (tag.year !== null && tag.week !== null && !isValidWeek(tag.year, tag.week)) {
          return reply.code(400).send(fail(ERROR_CODES.WEEK_OUT_OF_RANGE, '周次超出有效范围'));
        }

        const created = insertMemo(request.userId, text, tag.year, tag.week);
        return reply.code(201).send(ok(toMemoDto(created), '已添加'));
      } catch (error) {
        request.log.error({ err: error }, '新建备忘失败');
        return reply.code(500).send(internalError());
      }
    },
  );

  /** 更新备忘 */
  app.put<{ Params: { id: string }; Body: UpdateMemoBody }>(
    '/:id',
    { schema: { ...memoIdSchema(), ...updateMemoSchema() } },
    async (request, reply) => {
      try {
        const id = Number(request.params.id);
        const text = request.body.text.trim();
        if (text === '') {
          return reply.code(400).send(fail(ERROR_CODES.INVALID_PARAMS, '待办内容不能为空'));
        }

        const tag = normalizeWeekTag(request.body.year, request.body.week);
        if (tag.year !== null && tag.week !== null && !isValidWeek(tag.year, tag.week)) {
          return reply.code(400).send(fail(ERROR_CODES.WEEK_OUT_OF_RANGE, '周次超出有效范围'));
        }

        // 红线 1：以 request.userId 作为归属条件，改别人的记录会返回 changes === 0
        const updated = updateMemo(
          request.userId,
          id,
          text,
          request.body.done,
          request.body.pinned,
          tag.year,
          tag.week,
        );
        if (!updated) {
          return reply.code(404).send(fail(ERROR_CODES.MEMO_NOT_FOUND, '待办不存在'));
        }

        return reply.send(ok(null, '已保存'));
      } catch (error) {
        request.log.error({ err: error }, '更新备忘失败');
        return reply.code(500).send(internalError());
      }
    },
  );

  /** 删除备忘 */
  app.delete<{ Params: { id: string } }>(
    '/:id',
    { schema: memoIdSchema() },
    async (request, reply) => {
      try {
        const id = Number(request.params.id);

        // 红线 1：删别人的记录必须失败，而不是静默成功
        const deleted = deleteMemo(request.userId, id);
        if (!deleted) {
          return reply.code(404).send(fail(ERROR_CODES.MEMO_NOT_FOUND, '待办不存在'));
        }

        return reply.send(ok(null, '已删除'));
      } catch (error) {
        request.log.error({ err: error }, '删除备忘失败');
        return reply.code(500).send(internalError());
      }
    },
  );
};
