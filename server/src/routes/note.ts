import type { FastifyInstance, FastifyPluginAsync, FastifySchema } from 'fastify';
import { requireAuth } from '../middleware/session';
import {
  countNotes,
  deleteNote,
  insertNote,
  listNotes,
  sumNoteBytes,
  updateNote,
} from '../db/note';
import {
  NOTE_MAX_PER_USER,
  NOTE_TITLE_MAX_LENGTH,
  NOTE_TOTAL_BYTES_MAX_PER_USER,
} from '../constants';
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

/**
 * 便签内容 JSON Schema 片段
 * @remarks 刻意不设 maxLength：便签正文不限制字数（长内容在卡内滚动、全文走预览弹窗）。
 * 唯一的兜底是 Fastify 默认 1MB 的请求体上限，超限时返回 413 而不是静默截断。
 */
const contentSchema = (): Record<string, unknown> => ({
  type: 'string',
  default: '',
});

/** 便签标题 JSON Schema 片段 */
const titleSchema = (): Record<string, unknown> => ({
  type: 'string',
  maxLength: NOTE_TITLE_MAX_LENGTH,
  default: '',
});

/**
 * 新建便签请求体校验
 * @returns 请求体 JSON Schema
 * @remarks title / content 均允许缺省：便签可以是一张先开出来、稍后再写的空白纸。
 * 导出供隔离测试断言契约（字段必填性与「正文不设 maxLength」），路由注册不受影响。
 */
export const createNoteSchema = (): FastifySchema => ({
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      title: titleSchema(),
      content: contentSchema(),
      color: colorSchema(),
    },
  },
});

/**
 * 更新便签请求体校验（全量提交）
 * @returns 请求体 JSON Schema
 * @remarks 导出供隔离测试断言契约（title 必填、正文不设 maxLength）。
 */
export const updateNoteSchema = (): FastifySchema => ({
  body: {
    type: 'object',
    required: ['title', 'content', 'color', 'pinned'],
    additionalProperties: false,
    properties: {
      title: { type: 'string', maxLength: NOTE_TITLE_MAX_LENGTH },
      content: { type: 'string' },
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

/** 便签存储上限的展示文案（MB，向上取整，避免出现「0 MB」） */
const STORAGE_LIMIT_LABEL = `${Math.ceil(NOTE_TOTAL_BYTES_MAX_PER_USER / 1024 / 1024)} MB`;

/**
 * 校验便签正文总占用是否超出单用户上限
 * @param userId - 用户 ID，必须传入
 * @param adding - 本次要写入的正文
 * @param excludeId - 更新时传自身 ID，避免把该便签的旧内容重复计入
 * @returns 未超限返回 null；超限返回面向用户的提示文案
 * @remarks 单张便签的正文字数刻意不设限（见 contentSchema），总量必须兜底：
 * 单张只受 Fastify 的 1MB 请求体限制，2000 张就是约 2GB，多用户共用一个库文件。
 */
const checkStorageLimit = (userId: number, adding: string, excludeId?: number): string | null => {
  const used = sumNoteBytes(userId, excludeId);
  const incoming = Buffer.byteLength(adding, 'utf8');
  if (used + incoming <= NOTE_TOTAL_BYTES_MAX_PER_USER) return null;
  return `便签占用空间已达上限（${STORAGE_LIMIT_LABEL}），请先清理一些`;
};

/**
 * 把数据库行转换为接口出参
 * @param row - 便签行
 * @returns 便签出参
 */
const toNoteDto = (row: NoteRow): NoteDto => ({
  id: row.id,
  title: row.title,
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

        // 存储上限兜底：正文不限单张字数，总量必须有闸门
        const overflow = checkStorageLimit(request.userId, request.body.content ?? '');
        if (overflow !== null) {
          return reply.code(400).send(fail(ERROR_CODES.NOTE_STORAGE_LIMIT_REACHED, overflow));
        }

        const created = insertNote(request.userId, {
          title: request.body.title ?? '',
          content: request.body.content ?? '',
          color: request.body.color ?? '',
        });
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

        // 存储上限兜底：排除该便签自身的旧内容，否则长文改写会被自己的旧长度顶掉
        const overflow = checkStorageLimit(request.userId, request.body.content, id);
        if (overflow !== null) {
          return reply.code(400).send(fail(ERROR_CODES.NOTE_STORAGE_LIMIT_REACHED, overflow));
        }

        // 红线 1：以 request.userId 作为归属条件，改别人的记录会返回 changes === 0
        const updated = updateNote(request.userId, id, {
          title: request.body.title,
          content: request.body.content,
          color: request.body.color,
          pinned: request.body.pinned,
        });
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
