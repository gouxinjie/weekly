/**
 * 服务端领域常量
 * 说明：时间轴起点与周次上限属于「红线 3」，这里的默认值是权威来源，
 * 仅允许部署时通过环境变量覆盖，绝不允许从用户数据（如注册时间）推导。
 */

/** 环境变量默认值：时间轴起点年份（红线 3），不可修改 */
export const DEFAULT_START_YEAR = 2026;

/** 环境变量默认值：ISO 周次上限（红线 3），一年最多 53 周，写死 52 会丢掉每年最后一周 */
export const DEFAULT_MAX_WEEK = 53;

/** 环境变量默认值：同 IP 每小时注册上限，防批量灌水 */
export const DEFAULT_REGISTER_LIMIT_PER_HOUR = 10;

/** 限流统计窗口（分钟） */
export const RATE_LIMIT_WINDOW_MINUTES = 15;

/** 同手机号在限流窗口内允许的最大登录失败次数，防针对单账号的暴力破解 */
export const LOGIN_PHONE_MAX_FAILURES = 5;

/** 同 IP 在限流窗口内允许的最大登录失败次数，防换号扫号 */
export const LOGIN_IP_MAX_FAILURES = 20;

/** 会话 Cookie 名 */
export const SESSION_COOKIE_NAME = 'session';

/** 会话 Cookie 配置（统一在此定义，禁止散落各处的字面量） */
export const SESSION_COOKIE = {
  path: '/',

  /** 禁止 JS 读取，防 XSS 窃取会话 */
  httpOnly: true,

  /** 本项目的 CSRF 防护方案：SameSite=Strict，不引入 CSRF token */
  sameSite: 'strict',

  /** 30 天，必须与 session 表的 expires_at 保持一致 */
  maxAge: 30 * 24 * 60 * 60,

  // secure: true,  // ⚠️ 当前走 HTTP，设为 true 会导致 Cookie 不下发，启用 HTTPS 时必须同步打开
} as const;

/** 手机号格式：中国大陆 11 位 */
export const PHONE_PATTERN = '^1[3-9]\\d{9}$';

/** 密码最短长度，与前端校验保持一致 */
export const PASSWORD_MIN_LENGTH = 6;
