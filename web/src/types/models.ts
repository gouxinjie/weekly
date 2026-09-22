/**
 * 前端数据模型类型
 * 说明：与后端 server/src/types/api.ts 保持一致，接口一变这里必须同步。
 */

/** 用户信息 */
export interface User {
  /** 用户 ID */
  id: number;
  /** 手机号 */
  phone: string;
}

/** 周次引用（year + week 二元组） */
export interface WeekRef {
  /** ISO 年 */
  year: number;
  /** ISO 周次（1-53） */
  week: number;
}

/** 周报 */
export interface Weekly {
  /** ISO 年 */
  year: number;
  /** ISO 周次（1-53） */
  week: number;
  /** 该周周一，YYYY-MM-DD */
  weekStart: string;
  /** 该周周日，YYYY-MM-DD */
  weekEnd: string;
  /** Markdown 内容，未写过时为空字符串 */
  content: string;
  /** 最后更新时间，未写过时为空字符串 */
  updatedAt: string;
}

/** 待办条目 */
export interface Todo {
  /** 主键 */
  id: number;
  /** 待办文本 */
  text: string;
  /** 是否完成 */
  done: boolean;
  /** 是否置顶 */
  pinned: boolean;
  /** 标记的 ISO 年，未标记为 null */
  year: number | null;
  /** 标记的 ISO 周次，未标记为 null */
  week: number | null;
  /** 分类标识，空串表示未分类 */
  category: string;
  /** 创建时间 */
  createdAt: string;
}

/** 编辑模式：编辑 / 预览 */
export type EditorMode = 'edit' | 'preview';

/** 保存状态：用于标题栏「保存中 / 已保存」提示 */
export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** 待办筛选项：全部 / 本周 / 未完成 / 已完成 */
export type TodoFilter = 'all' | 'week' | 'undone' | 'done';
