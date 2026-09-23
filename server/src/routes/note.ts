import type { FastifyInstance, FastifyPluginAsync, FastifySchema } from 'fastify';
import { requireAuth } from '../middleware/session';
import { countNotes, deleteNote, insertNote, listNotes, updateNote } from '../db/note';
import { NOTE_MAX_LENGTH, NOTE_MAX_PER_USER } from '../constants';
import { ERROR_CODES, fail, internalError, ok } from '../utils/response';
import type { CreateNoteBody, NoteDto, UpdateNoteBody } from '../types/api';
import type { NoteRow } from '../types/models';

/** 便签纸颜色的合法取值：空串表示默认底色。前端 constants 的 NOTE_COLORS 与此一一对应 */
export const NOTE_COLORS = ['', 'yellow', 'green'] as const;

/** 便签纸颜色标识：即白名单的取值类型 */
export type NoteColorValue = (typeof NOTE_COLORS)[number];

/**
 * 归一化便签纸颜色
 * @param color - 数据库中存着的颜色标识
 * @returns 白名单内的取值；不在白名单内时退回默认底色（空串）
 * @remarks 白名单由五种收敛为三种后，历史行可能仍留着 blue / pink。
 * 这类取值若原样回给出参，前端拿不到样式类名（卡片失去纸色、色块无一高亮），
 * 且该便签每次全量提交都会带上它并被 JSON Schema 的 enum 打回 400，
 * 表现为一直「保存失败」。数据库侧另有 v6 迁移把历史行刷成默认底色，这里是第二道保险。
 */
export const normalizeNoteColor = (color: string): NoteColorValue =>
  (NOTE_COLORS as readonly string[]).includes(color) ? (color as NoteColorValue) : '';

/** 便签纸颜色 JSON Schema 片段 */
const colorSchema = (): Record<string, unknown> => ({
  type: 'string',
  enum: [...NOTE_COLORS],
  default: '',
});

/** 便签内容 JSON Schema 片段 */
const contentSchema = (): Record<string, unknown> => ({
  type: 'string',
  maxLength: NOTE_MAX_LENGTH,
  default: '',
});

/**
 * 新建便签请求体校验
 * @returns 请求体 JSON Schema
 * @remarks content 允许缺省：便签可以是一张先开出来、稍后再写的空白纸。
 */
const createNoteSchema = (): FastifySchema => ({
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      content: contentSchema(),
      color: colorSchema(),
    },
  },
});

/**
 * 更新便签请求体校验（全量提交）
 * @returns 请求体 JSON Schema
 */
const updateNoteSchema = (): FastifySchema => ({
  body: {
    type: 'object',
    required: ['content', 'color', 'pinned'],
    additionalProperties: false,
    properties: {
      content: { type: 'string', maxLength: NOTE_MAX_LENGTH },
      color: colorSchema(),
      pinned: { type: 'boolean' },
    },
  },
});

/**
 * 便签 ID 路径参数校验
 * @returns 路径参数 JSON Schema
 */
const noteIdSchema = (): FastifySchema => ({
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
 * 把数据库行转换为接口出参
 * @param row - 便签行
 * @returns 便签出参
 */
const toNoteDto = (row: NoteRow): NoteDto => ({
  id: row.id,
  content: row.content,
  color: normalizeNoteColor(row.color),
  pinned: row.pinned === 1,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/** 便签相关路由（全部需要登录） */
export const noteRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', requireAuth);

  /** 列出当前用户全部便签 */
  app.get('/', async (request, reply) => {
    try {
      const list = listNotes(request.userId).map(toNoteDto);
      return reply.send(ok(list, '获取成功'));
    } catch (error) {
      request.log.error({ err: error }, '查询便签失败');
      return reply.code(500).send(internalError());
    }
  });

  /** 新建便签 */
  app.post<{ Body: CreateNoteBody }>(
    '/',
    { schema: createNoteSchema() },
    async (request, reply) => {
      try {
        // 数量上限兜底：便签是唯一允许「空白即存在」的模块，创建成本最低
        if (countNotes(request.userId) >= NOTE_MAX_PER_USER) {
          return reply
            .code(400)
            .send(
              fail(
                ERROR_CODES.NOTE_LIMIT_REACHED,
                `便签数量已达上限（${NOTE_MAX_PER_USER} 张），请先清理一些`,
              ),
            );
        }

        const created = insertNote(
          request.userId,
          request.body.content ?? '',
          request.body.color ?? '',
        );
        return reply.code(201).send(ok(toNoteDto(created), '已添加'));
      } catch (error) {
        request.log.error({ err: error }, '新建便签失败');
        return reply.code(500).send(internalError());
      }
    },
  );

  /** 更新便签 */
  app.put<{ Params: { id: string }; Body: UpdateNoteBody }>(
    '/:id',
    { schema: { ...noteIdSchema(), ...updateNoteSchema() } },
    async (request, reply) => {
      try {
        const id = Number(request.params.id);

        // 红线 1：以 request.userId 作为归属条件，改别人的记录会返回 changes === 0
        const updated = updateNote(
          request.userId,
          id,
          request.body.content,
          request.body.color,
          request.body.pinned,
        );
        if (!updated) {
          return reply.code(404).send(fail(ERROR_CODES.NOTE_NOT_FOUND, '便签不存在'));
        }

        return reply.send(ok(null, '已保存'));
      } catch (error) {
        request.log.error({ err: error }, '更新便签失败');
        return reply.code(500).send(internalError());
      }
    },
  );

  /** 删除便签 */
  app.delete<{ Params: { id: string } }>(
    '/:id',
    { schema: noteIdSchema() },
    async (request, reply) => {
      try {
        const id = Number(request.params.id);

        // 红线 1：删别人的记录必须失败，而不是静默成功
        const deleted = deleteNote(request.userId, id);
        if (!deleted) {
          return reply.code(404).send(fail(ERROR_CODES.NOTE_NOT_FOUND, '便签不存在'));
        }

        return reply.send(ok(null, '已删除'));
      } catch (error) {
        request.log.error({ err: error }, '删除便签失败');
        return reply.code(500).send(internalError());
      }
    },
  );
};
