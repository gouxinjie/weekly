import type { FastifyInstance, FastifyPluginAsync, FastifySchema } from 'fastify';
import { requireAuth } from '../middleware/session';
import {
  countUndoneTodos,
  deleteTodo,
  insertTodo,
  listTodos,
  listTodosByWeek,
  reorderTodos,
  updateTodo,
} from '../db/todo';
import { isValidWeek } from '../utils/week';
import { ERROR_CODES, fail, internalError, ok } from '../utils/response';
import type {
  CreateTodoBody,
  ReorderTodosBody,
  TodoDto,
  TodoSummaryDto,
  UpdateTodoBody,
} from '../types/api';
import type { TodoRow } from '../types/models';

/**
 * 可空整数的 JSON Schema 片段
 * 每次调用返回新对象：同一 schema 对象被多处引用时 ajv 会因重复编译报错。
 * @returns 允许 integer 或 null 的 JSON Schema
 */
const nullableInteger = (): Record<string, unknown> => ({
  anyOf: [{ type: 'integer' }, { type: 'null' }],
});

/** 待办分类的合法取值：空串表示未分类 */
export const TODO_CATEGORIES = ['', 'product', 'dev', 'test', 'doc', 'life'] as const;

/** 待办分类 JSON Schema 片段 */
const categorySchema = (): Record<string, unknown> => ({
  type: 'string',
  enum: [...TODO_CATEGORIES],
  default: '',
});

/**
 * 新建待办请求体校验
 * @returns 请求体 JSON Schema
 */
const createTodoSchema = (): FastifySchema => ({
  body: {
    type: 'object',
    required: ['text'],
    additionalProperties: false,
    properties: {
      text: { type: 'string', minLength: 1, maxLength: 500 },
      year: nullableInteger(),
      week: nullableInteger(),
      category: categorySchema(),
    },
  },
});

/**
 * 更新待办请求体校验（全量提交）
 * @returns 请求体 JSON Schema
 */
const updateTodoSchema = (): FastifySchema => ({
  body: {
    type: 'object',
    required: ['text', 'done', 'pinned', 'year', 'week', 'category'],
    additionalProperties: false,
    properties: {
      text: { type: 'string', minLength: 1, maxLength: 500 },
      done: { type: 'boolean' },
      pinned: { type: 'boolean' },
      year: nullableInteger(),
      week: nullableInteger(),
      category: categorySchema(),
    },
  },
});

/**
 * 拖拽排序请求体校验（M-05）
 * @returns 请求体 JSON Schema
 */
const reorderSchema = (): FastifySchema => ({
  body: {
    type: 'object',
    required: ['ids'],
    additionalProperties: false,
    properties: {
      ids: {
        type: 'array',
        minItems: 1,
        // 上限兜底：单次排序不可能超过一个用户的待办总量，防止超大数组打满事务
        maxItems: 500,
        items: { type: 'integer', minimum: 1 },
      },
    },
  },
});

/**
 * 待办 ID 路径参数校验
 * @returns 路径参数 JSON Schema
 */
const todoIdSchema = (): FastifySchema => ({
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
 * @param row - 待办行
 * @returns 待办出参
 */
const toTodoDto = (row: TodoRow): TodoDto => ({
  id: row.id,
  text: row.text,
  done: row.done === 1,
  pinned: row.pinned === 1,
  year: row.year,
  week: row.week,
  category: row.category,
  createdAt: row.created_at,
});

/** 待办相关路由（全部需要登录） */
export const todoRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', requireAuth);

  /** 列出当前用户全部待办 */
  app.get('/', async (request, reply) => {
    try {
      const list = listTodos(request.userId).map(toTodoDto);
      return reply.send(ok(list, '获取成功'));
    } catch (error) {
      request.log.error({ err: error }, '查询待办失败');
      return reply.code(500).send(internalError());
    }
  });

  /** 待办概要：只返回未完成条数，供页签角标使用（M-09），不为了一个数字拉全量列表 */
  app.get('/summary', async (request, reply) => {
    try {
      const summary: TodoSummaryDto = { undone: countUndoneTodos(request.userId) };
      return reply.send(ok(summary, '获取成功'));
    } catch (error) {
      request.log.error({ err: error }, '统计待办概要失败');
      return reply.code(500).send(internalError());
    }
  });

  /** 列出标记到指定周的待办（周报右栏「本周待办」） */
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

        const list = listTodosByWeek(request.userId, year, week).map(toTodoDto);
        return reply.send(ok(list, '获取成功'));
      } catch (error) {
        request.log.error({ err: error }, '查询本周待办失败');
        return reply.code(500).send(internalError());
      }
    },
  );

  /** 新建待办 */
  app.post<{ Body: CreateTodoBody }>(
    '/',
    { schema: createTodoSchema() },
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

        // 分类缺省时按未分类处理
        const category = request.body.category ?? '';
        const created = insertTodo(request.userId, text, tag.year, tag.week, category);
        return reply.code(201).send(ok(toTodoDto(created), '已添加'));
      } catch (error) {
        request.log.error({ err: error }, '新建待办失败');
        return reply.code(500).send(internalError());
      }
    },
  );

  /**
   * 拖拽排序（M-05）：只提交「同一分组内」拖拽后的完整顺序，服务端按下标重排序号
   * 说明：路由注册在 PUT /:id 之前；`/order` 是静态段，也不会被 `^\d+$` 的 id 校验吞掉
   */
  app.put<{ Body: ReorderTodosBody }>(
    '/order',
    { schema: reorderSchema() },
    async (request, reply) => {
      try {
        // 红线 1：db 层逐条按 id + user_id 更新，任一条不属于该用户则整体回滚
        const reordered = reorderTodos(request.userId, request.body.ids);
        if (!reordered) {
          return reply.code(404).send(fail(ERROR_CODES.TODO_NOT_FOUND, '待办不存在'));
        }

        return reply.send(ok(null, '已保存'));
      } catch (error) {
        request.log.error({ err: error }, '待办排序失败');
        return reply.code(500).send(internalError());
      }
    },
  );

  /** 更新待办 */
  app.put<{ Params: { id: string }; Body: UpdateTodoBody }>(
    '/:id',
    { schema: { ...todoIdSchema(), ...updateTodoSchema() } },
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
        const updated = updateTodo(
          request.userId,
          id,
          text,
          request.body.done,
          request.body.pinned,
          tag.year,
          tag.week,
          request.body.category,
        );
        if (!updated) {
          return reply.code(404).send(fail(ERROR_CODES.TODO_NOT_FOUND, '待办不存在'));
        }

        return reply.send(ok(null, '已保存'));
      } catch (error) {
        request.log.error({ err: error }, '更新待办失败');
        return reply.code(500).send(internalError());
      }
    },
  );

  /** 删除待办 */
  app.delete<{ Params: { id: string } }>(
    '/:id',
    { schema: todoIdSchema() },
    async (request, reply) => {
      try {
        const id = Number(request.params.id);

        // 红线 1：删别人的记录必须失败，而不是静默成功
        const deleted = deleteTodo(request.userId, id);
        if (!deleted) {
          return reply.code(404).send(fail(ERROR_CODES.TODO_NOT_FOUND, '待办不存在'));
        }

        return reply.send(ok(null, '已删除'));
      } catch (error) {
        request.log.error({ err: error }, '删除待办失败');
        return reply.code(500).send(internalError());
      }
    },
  );
};
