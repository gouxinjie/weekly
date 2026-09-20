/**
 * 前端接口出入参类型
 * 说明：统一响应格式定义在 client.ts 的类型守卫里，这里只放各接口的入参与出参。
 */

import type { Memo, User, WeekRef, Weekly } from './models';

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

/** 新建备忘入参 */
export interface CreateMemoBody {
  /** 待办文本 */
  text: string;
  /** 标记的 ISO 年 */
  year?: number | null;
  /** 标记的 ISO 周次 */
  week?: number | null;
  /** 分类标识，缺省表示未分类 */
  category?: string;
}

/** 更新备忘入参（全量提交） */
export interface UpdateMemoBody {
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

/** 注册 / 登录 / me 接口出参 */
export type UserResponse = User;

/** 周报接口出参 */
export type WeeklyResponse = Weekly;

/** 已写周次列表出参 */
export type WrittenWeeksResponse = WeekRef[];

/** 备忘列表接口出参 */
export type MemoListResponse = Memo[];
