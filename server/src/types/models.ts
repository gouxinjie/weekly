/**
 * 数据库行类型
 * 说明：SQLite 没有布尔类型，布尔语义一律用 0 / 1 的整数表示。
 */

/** user 表行类型 */
export interface UserRow {
  /** 主键 */
  id: number;
  /** 手机号，全局唯一 */
  phone: string;
  /** argon2 哈希后的密码，绝不存明文 */
  password_hash: string;
  /** 注册时间，ISO 8601 字符串 */
  created_at: string;
}

/** session 表行类型 */
export interface SessionRow {
  /** 主键 */
  id: number;
  /** 会话令牌，256 位随机十六进制串 */
  token: string;
  /** 归属用户 ID */
  user_id: number;
  /** 创建时间，ISO 8601 字符串 */
  created_at: string;
  /** 过期时间，ISO 8601 字符串 */
  expires_at: string;
}

/** weekly 表行类型 */
export interface WeeklyRow {
  /** 主键 */
  id: number;
  /** 归属用户 ID */
  user_id: number;
  /** ISO 年 */
  year: number;
  /** ISO 周次（1-53） */
  week: number;
  /** 该周周一，ISO 8610 日期 */
  week_start: string;
  /** 该周周日，ISO 8601 日期 */
  week_end: string;
  /** Markdown 内容 */
  content: string;
  /** 创建时间，ISO 8601 字符串 */
  created_at: string;
  /** 最后更新时间，ISO 8601 字符串 */
  updated_at: string;
}

/** todo 表行类型 */
export interface TodoRow {
  /** 主键 */
  id: number;
  /** 归属用户 ID */
  user_id: number;
  /** 待办文本，单行 */
  text: string;
  /** 是否完成：0 未完成 / 1 已完成 */
  done: number;
  /** 是否置顶：0 普通 / 1 置顶 */
  pinned: number;
  /** 可选标记的 ISO 年，未标记时为 null */
  year: number | null;
  /** 可选标记的 ISO 周次，未标记时为 null */
  week: number | null;
  /** 分类标识：空串表示未分类，其余取值见 routes/todo.ts 的 TODO_CATEGORIES */
  category: string;
  /** 创建时间，ISO 8601 字符串 */
  created_at: string;
  /** 最后更新时间，ISO 8601 字符串 */
  updated_at: string;
}

/** login_attempt 表行类型 */
export interface LoginAttemptRow {
  /** 主键 */
  id: number;
  /** 行为范围：login / register */
  scope: string;
  /** 限流维度：phone / ip */
  dimension: string;
  /** 维度取值：手机号或 IP */
  identifier: string;
  /** 是否成功：0 失败 / 1 成功 */
  success: number;
  /** 发生时间，ISO 8601 字符串 */
  created_at: string;
}

/** 周次引用（year + week 二元组） */
export interface WeekRef {
  /** ISO 年 */
  year: number;
  /** ISO 周次 */
  week: number;
}
