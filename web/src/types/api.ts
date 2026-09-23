/**
 * 前端接口出入参类型
 * 说明：统一响应格式定义在 client.ts 的类型守卫里，这里只放各接口的入参与出参。
 */

import type { Note, NoteColor, Todo, User, WeekRef, Weekly } from './models';

/** 登录 / 注册入参 */
export interface CredentialsBody {
  /** 手机号 */
  phone: string;
  /** 明文密码 */
  password: string;
}

/** 修改密码入参 */
export interface ChangePasswordBody {
  /** 原密码 */
  oldPassword: string;
  /** 新密码 */
  newPassword: string;
}

/** 周报保存入参 */
export interface SaveWeeklyBody {
  /** Markdown 内容 */
  content: string;
}

/** 新建待办入参 */
export interface CreateTodoBody {
  /** 待办文本 */
  text: string;
  /** 标记的 ISO 年 */
  year?: number | null;
  /** 标记的 ISO 周次 */
  week?: number | null;
  /** 分类标识，缺省表示未分类 */
  category?: string;
}

/** 更新待办入参（全量提交） */
export interface UpdateTodoBody {
  /** 待办文本 */
  text: string;
  /** 是否完成 */
  done: boolean;
  /** 是否置顶 */
  pinned: boolean;
  /** 标记的 ISO 年 */
  year: number | null;
  /** 标记的 ISO 周次 */
  week: number | null;
  /** 分类标识，空串表示未分类 */
  category: string;
}

/** 待办拖拽排序入参（M-05：只提交同一分组内的新顺序） */
export interface ReorderTodosBody {
  /** 同一分组内拖拽后的待办 ID 顺序 */
  ids: number[];
}

/** 新建便签入参 */
export interface CreateNoteBody {
  /** 纯文本内容，缺省视为空串（先开一张空白便签再写） */
  content?: string;
  /** 便签纸颜色标识，缺省表示默认底色 */
  color?: NoteColor;
}

/** 更新便签入参（全量提交） */
export interface UpdateNoteBody {
  /** 纯文本内容 */
  content: string;
  /** 便签纸颜色标识，空串表示默认底色 */
  color: NoteColor;
  /** 是否置顶 */
  pinned: boolean;
}

/** 待办概要（M-09 页签角标） */
export interface TodoSummary {
  /** 未完成的待办条数 */
  undone: number;
}

/** 注册 / 登录 / me 接口出参 */
export type UserResponse = User;

/** 周报接口出参 */
export type WeeklyResponse = Weekly;

/** 已写周次列表出参 */
export type WrittenWeeksResponse = WeekRef[];

/** 待办列表接口出参 */
export type TodoListResponse = Todo[];

/** 便签列表接口出参 */
export type NoteListResponse = Note[];
