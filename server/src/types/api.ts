/**
 * 前后端接口出入参类型
 * 说明：所有接口统一返回 ApiResponse，前端必须处理 success 的两种分支。
 */

/** 统一成功响应 */
export interface ApiSuccess<T> {
  /** 固定为 true */
  success: true;
  /** HTTP 状态码 */
  code: number;
  /** 提示文案（中文） */
  message: string;
  /** 业务数据 */
  data: T;
}

/** 统一失败响应 */
export interface ApiFailure {
  /** 固定为 false */
  success: false;
  /** 语义化字符串错误码 */
  code: string;
  /** 错误描述（中文，不泄露内部细节） */
  message: string;
  /** 失败时恒为 null */
  data: null;
}

/** 统一响应联合类型 */
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

/** 用户信息（不含任何密钥材料） */
export interface UserDto {
  /** 用户 ID */
  id: number;
  /** 手机号 */
  phone: string;
}

/** 注册 / 登录入参 */
export interface CredentialsBody {
  /** 手机号 */
  phone: string;
  /** 明文密码，仅用于当次校验，不落库 */
  password: string;
}

/** 修改密码入参 */
export interface ChangePasswordBody {
  /** 原密码，用于校验身份 */
  oldPassword: string;
  /** 新密码，必须为数字 + 字母且长度 ≥ 8 */
  newPassword: string;
}

/** 周报出参 */
export interface WeeklyDto {
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

/** 周报写入入参 */
export interface SaveWeeklyBody {
  /** Markdown 内容 */
  content: string;
}

/** 待办出参 */
export interface TodoDto {
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

/** 新建待办入参 */
export interface CreateTodoBody {
  /** 待办文本 */
  text: string;
  /** 可选标记的 ISO 年 */
  year?: number | null;
  /** 可选标记的 ISO 周次 */
  week?: number | null;
  /** 分类标识，缺省表示未分类 */
  category?: string;
}

/** 更新待办入参（全量提交，语义简单且天然防字段注入） */
export interface UpdateTodoBody {
  /** 待办文本 */
  text: string;
  /** 是否完成 */
  done: boolean;
  /** 是否置顶 */
  pinned: boolean;
  /** 标记的 ISO 年，取消标记传 null */
  year: number | null;
  /** 标记的 ISO 周次，取消标记传 null */
  week: number | null;
  /** 分类标识，空串表示未分类 */
  category: string;
}

/** 待办拖拽排序入参（M-05：只提交同一分组内的新顺序） */
export interface ReorderTodosBody {
  /** 同一分组内拖拽后的待办 ID 顺序 */
  ids: number[];
}

/** 待办概要出参（M-09：页签角标只关心未完成条数） */
export interface TodoSummaryDto {
  /** 未完成的待办条数 */
  undone: number;
}

/** 健康检查出参 */
export interface HealthDto {
  /** 服务存活标记 */
  ok: boolean;
}
