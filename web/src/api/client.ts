/**
 * 基础请求封装
 * 说明：统一处理「网络异常 / 非统一响应体 / 业务失败」三种情况，
 * 全部转换成 ApiError，调用方只需处理一种异常类型。
 */

/** 接口业务异常 */
export class ApiError extends Error {
  /** 语义化错误码，如 INVALID_CREDENTIALS、WEEK_OUT_OF_RANGE */
  public readonly code: string;

  /** HTTP 状态码，网络异常时为 0 */
  public readonly status: number;

  /**
   * 构造接口异常
   * @param code - 语义化错误码
   * @param message - 面向用户的中文提示
   * @param status - HTTP 状态码
   */
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

/** 统一成功响应 */
interface ApiSuccessBody<T> {
  /** 固定为 true */
  success: true;
  /** HTTP 状态码 */
  code: number;
  /** 提示文案 */
  message: string;
  /** 业务数据 */
  data: T;
}

/** 统一失败响应 */
interface ApiFailureBody {
  /** 固定为 false */
  success: false;
  /** 语义化错误码 */
  code: string;
  /** 错误描述 */
  message: string;
  /** 恒为 null */
  data: null;
}

/** 统一响应联合类型 */
type ApiBody<T> = ApiSuccessBody<T> | ApiFailureBody;

/** 支持的请求方法 */
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

/**
 * 判断响应体是否符合统一响应格式
 * @param value - 反序列化后的响应体
 * @returns 是否符合统一响应格式
 */
const isApiBody = (value: unknown): value is ApiBody<unknown> => {
  if (typeof value !== 'object' || value === null) return false;
  if (!('success' in value)) return false;
  return typeof (value as { success: unknown }).success === 'boolean';
};

/**
 * 发送请求并解包统一响应
 * @param method - HTTP 方法
 * @param url - 接口路径（同源，走 Vite 代理或 Nginx 反代）
 * @param body - 请求体，GET / DELETE 不传
 * @returns 解包后的业务数据
 * @throws ApiError 网络异常、响应格式异常或业务失败时抛出
 */
const send = async <T>(method: HttpMethod, url: string, body?: unknown): Promise<T> => {
  const init: RequestInit = {
    method,
    // 会话依赖 Cookie，必须同源携带
    credentials: 'same-origin',
  };

  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new ApiError('NETWORK_ERROR', '网络异常，请检查网络后重试', 0);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(
      'INVALID_RESPONSE',
      '接口没有返回数据，请确认后端服务已启动且端口配置一致',
      response.status,
    );
  }

  if (!isApiBody(payload)) {
    throw new ApiError(
      'INVALID_RESPONSE',
      '接口返回格式异常，请确认端口没有被其他服务占用',
      response.status,
    );
  }

  if (!payload.success) {
    throw new ApiError(payload.code, payload.message, response.status);
  }

  return payload.data as T;
};

/** 请求方法集合（业务接口按模块拆分，统一从这里调用） */
export const request = {
  /**
   * 发起 GET 请求
   * @param url - 接口路径
   * @returns 业务数据
   */
  get: <T>(url: string): Promise<T> => send<T>('GET', url),

  /**
   * 发起 POST 请求
   * @param url - 接口路径
   * @param body - 请求体
   * @returns 业务数据
   */
  post: <T>(url: string, body?: unknown): Promise<T> => send<T>('POST', url, body),

  /**
   * 发起 PUT 请求
   * @param url - 接口路径
   * @param body - 请求体
   * @returns 业务数据
   */
  put: <T>(url: string, body?: unknown): Promise<T> => send<T>('PUT', url, body),

  /**
   * 发起 DELETE 请求
   * @param url - 接口路径
   * @returns 业务数据
   */
  delete: <T>(url: string): Promise<T> => send<T>('DELETE', url),
};

/**
 * 提取异常的用户可读文案
 * @param error - 捕获到的异常
 * @param fallback - 兜底文案
 * @returns 可直接展示的中文提示
 */
export const toErrorMessage = (error: unknown, fallback = '操作失败，请稍后重试'): string => {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message !== '') return error.message;
  return fallback;
};

/**
 * 判断异常是否为未登录
 * @param error - 捕获到的异常
 * @returns 是否为 401
 */
export const isUnauthorized = (error: unknown): boolean =>
  error instanceof ApiError && error.status === 401;
