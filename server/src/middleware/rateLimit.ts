import type { FastifyRequest } from 'fastify';
import {
  LOGIN_IP_MAX_FAILURES,
  LOGIN_PHONE_MAX_FAILURES,
  RATE_LIMIT_WINDOW_MINUTES,
} from '../constants';
import { config } from '../config';
import { cleanOldAttempts, countFailures, countSuccesses } from '../db/loginAttempt';

/** 限流判定结果 */
export interface RateLimitResult {
  /** 是否放行 */
  allowed: boolean;
  /** 被拒绝时的提示文案（中文） */
  message: string;
}

/**
 * 取客户端真实 IP
 * @param request - Fastify 请求对象
 * @returns 客户端 IP；经 Nginx 反代时由 X-Real-IP 透传
 * @remarks 若 Nginx 未透传真实 IP，所有用户会共用一个限流额度，限流将形同虚设。
 */
export const getClientIp = (request: FastifyRequest): string => {
  const realIp = request.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim() !== '') return realIp.trim();

  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim() !== '') {
    return forwarded.split(',')[0].trim();
  }

  return request.ip;
};

/**
 * 生成限流窗口起点
 * @param minutes - 窗口长度（分钟）
 * @returns ISO 8601 时间字符串
 */
const windowStart = (minutes: number): string =>
  new Date(Date.now() - minutes * 60 * 1000).toISOString();

/**
 * 清除超出限流窗口的历史尝试记录
 * @returns 无
 */
const cleanExpired = (): void => {
  // 保留一个窗口长度以上的记录没有意义，顺手清理避免表无限增长
  cleanOldAttempts(new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000).toISOString());
};

/**
 * 登录限流检查（同时按手机号与 IP 两个维度）
 * @param phone - 登录手机号
 * @param ip - 客户端 IP
 * @returns 限流判定结果
 * @remarks 必须在密码校验之前调用，否则攻击者仍可通过响应时间差异探测账号是否存在。
 */
export const checkLoginRateLimit = (phone: string, ip: string): RateLimitResult => {
  cleanExpired();
  const since = windowStart(RATE_LIMIT_WINDOW_MINUTES);

  if (countFailures('login', 'phone', phone, since) >= LOGIN_PHONE_MAX_FAILURES) {
    return {
      allowed: false,
      message: `密码错误次数过多，请 ${RATE_LIMIT_WINDOW_MINUTES} 分钟后再试`,
    };
  }

  if (countFailures('login', 'ip', ip, since) >= LOGIN_IP_MAX_FAILURES) {
    return {
      allowed: false,
      message: `当前网络登录失败次数过多，请 ${RATE_LIMIT_WINDOW_MINUTES} 分钟后再试`,
    };
  }

  return { allowed: true, message: '' };
};

/**
 * 注册限流检查（按 IP 每小时注册上限）
 * @param ip - 客户端 IP
 * @returns 限流判定结果
 * @remarks 成功与失败都计数，否则挡不住批量灌水。
 */
export const checkRegisterRateLimit = (ip: string): RateLimitResult => {
  cleanExpired();
  const since = windowStart(60);

  const failures = countFailures('register', 'ip', ip, since);
  const successes = countSuccesses('register', 'ip', ip, since);

  if (failures + successes >= config.registerLimitPerHour) {
    return { allowed: false, message: '注册过于频繁，请稍后再试' };
  }

  return { allowed: true, message: '' };
};
