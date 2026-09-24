/**
 * 服务端领域常量
 * 说明：时间轴起点与周次上限属于「红线 3」，这里的默认值是权威来源，
 * 仅允许部署时通过环境变量覆盖，绝不允许从用户数据（如注册时间）推导。
 */

/**
 * 环境变量默认值：时间轴起点年份（红线 3），当前为 2025，早于该年的周次一律拒绝写入
 * 说明：只是「环境变量缺省时」的兜底值，实际取值由 START_YEAR 决定（见 config.ts），
 * 改这里的常量不会改变已有 .env 的部署环境，起点变更必须连同 CI 与服务器的 .env 一起改。
 */
export const DEFAULT_START_YEAR = 2025;

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

/**
 * 会话 Cookie 配置（统一在此定义，禁止散落各处的字面量）
 * 说明：这里刻意不含 maxAge——它必须与 session 表的 expires_at 同源（都由 config.sessionDays 推导），
 * 写死一个「30 天」会在 SESSION_DAYS 被改动时与服务端有效期脱节，
 * 出现「Cookie 还在但会话已过期」或反之。取带 maxAge 的完整配置请用 config.sessionCookie。
 */
export const SESSION_COOKIE = {
  path: '/',

  /** 禁止 JS 读取，防 XSS 窃取会话 */
  httpOnly: true,

  /** 本项目的 CSRF 防护方案：SameSite=Strict，不引入 CSRF token */
  sameSite: 'strict',

  // secure: true,  // ⚠️ 当前走 HTTP，设为 true 会导致 Cookie 不下发，启用 HTTPS 时必须同步打开
} as const;

/** 手机号格式：中国大陆 11 位 */
export const PHONE_PATTERN = '^1[3-9]\\d{9}$';

/** 密码最短长度，与前端校验保持一致 */
export const PASSWORD_MIN_LENGTH = 6;

/** 单张便签的纯文本长度上限，与前端 constants/index.ts 的 NOTE_MAX_CHARS 保持一致 */
export const NOTE_MAX_LENGTH = 2000;

/**
 * 单个用户的便签数量上限
 * 说明：便签是唯一允许「空白即存在」的模块，新建成本最低，需要一个数量上限兜底，
 * 否则登录用户可以无限灌数据（多用户共用一个库文件）。2000 张对「随手记」而言足够宽裕，
 * 达到上限时新建会被拒绝，用户清理几张即可继续。
 */
export const NOTE_MAX_PER_USER = 2000;
