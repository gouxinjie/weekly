import type { ApiFailure, ApiSuccess } from '../types/api';

/** 语义化错误码（不使用纯数字） */
export const ERROR_CODES = {
  /** 参数校验失败 */
  INVALID_PARAMS: 'INVALID_PARAMS',
  /** 手机号或密码错误（登录失败统一文案，不区分账号是否存在） */
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  /** 手机号已被注册 */
  PHONE_EXISTS: 'PHONE_EXISTS',
  /** 密码强度不足 */
  WEAK_PASSWORD: 'WEAK_PASSWORD',
  /** 原密码错误 */
  OLD_PASSWORD_MISMATCH: 'OLD_PASSWORD_MISMATCH',
  /** 未登录或会话已失效 */
  UNAUTHORIZED: 'UNAUTHORIZED',
  /** 请求过于频繁 */
  RATE_LIMITED: 'RATE_LIMITED',
  /** 周次越界（早于起点年份或超过周次上限） */
  WEEK_OUT_OF_RANGE: 'WEEK_OUT_OF_RANGE',
  /** 待办不存在或不属于当前用户 */
  TODO_NOT_FOUND: 'TODO_NOT_FOUND',
  /** 服务异常 */
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

/** 错误码字面量联合类型 */
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/**
 * 构造成功响应
 * @param data - 业务数据
 * @param message - 提示文案
 * @returns 统一成功响应体
 */
export const ok = <T>(data: T, message = '操作成功'): ApiSuccess<T> => ({
  success: true,
  code: 200,
  message,
  data,
});

/**
 * 构造失败响应
 * @param code - 语义化错误码
 * @param message - 面向用户的中文描述，禁止包含 SQL、表名与堆栈
 * @returns 统一失败响应体
 */
export const fail = (code: ErrorCode, message: string): ApiFailure => ({
  success: false,
  code,
  message,
  data: null,
});

/** 未登录统一响应：不区分「token 不存在」与「已过期」 */
export const unauthorized = (): ApiFailure =>
  fail(ERROR_CODES.UNAUTHORIZED, '登录已失效，请重新登录');

/** 服务异常统一响应：不向前端泄露内部细节 */
export const internalError = (): ApiFailure =>
  fail(ERROR_CODES.INTERNAL_ERROR, '服务异常，请稍后重试');
