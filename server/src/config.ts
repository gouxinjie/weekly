import path from 'node:path';
import {
  DEFAULT_MAX_WEEK,
  DEFAULT_REGISTER_LIMIT_PER_HOUR,
  DEFAULT_START_YEAR,
} from './constants';

/**
 * 仓库根目录
 * src/ 与 dist/ 都位于 server/ 下的一层，因此向上两级恒为仓库根，
 * 这样开发态（tsx）与生产态（dist）的 DB_PATH 解析结果完全一致。
 */
const ROOT_DIR = path.resolve(__dirname, '..', '..');

/** 根目录 .env（与前端共用同一份，两端端口配置因此不会各说各话） */
const ENV_FILE = path.join(ROOT_DIR, '.env');

// 本地开发从根目录 .env 读取配置；生产环境由 systemd 的 EnvironmentFile 注入，
// 且已存在的环境变量优先，因此这里不会覆盖线上配置。
try {
  process.loadEnvFile(ENV_FILE);
} catch {
  // .env 不存在时保持现状，改由环境变量提供配置
}

/**
 * 读取环境变量
 * @param key - 变量名
 * @param fallback - 缺省值
 * @returns 变量值（未设置时返回缺省值）
 */
const readEnv = (key: string, fallback: string): string => {
  const value = process.env[key];
  return value === undefined || value === '' ? fallback : value;
};

/**
 * 读取并校验整数型环境变量
 * @param key - 变量名
 * @param fallback - 缺省值
 * @param min - 允许的最小值
 * @returns 校验通过的整数
 * @throws 当取值不是合法整数或超出范围时抛错，由启动流程终止进程
 */
const readIntEnv = (key: string, fallback: number, min: number): number => {
  const raw = readEnv(key, String(fallback));
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`环境变量 ${key} 取值非法：${raw}`);
  }
  return value;
};

/**
 * 解析数据库文件路径
 * @param rawPath - 环境变量中的原始路径
 * @returns 绝对路径；相对路径以仓库根目录为基准
 */
const resolveDbPath = (rawPath: string): string =>
  path.isAbsolute(rawPath) ? rawPath : path.resolve(ROOT_DIR, rawPath);

/** 服务配置（启动时一次性读取并校验） */
export interface ServerConfig {
  /** 监听端口，仅内网 */
  port: number;
  /** 监听地址，默认 127.0.0.1，不允许设成 0.0.0.0 直接暴露公网 */
  host: string;
  /** 数据库文件绝对路径 */
  dbPath: string;
  /** 会话有效期（天） */
  sessionDays: number;
  /** ISO 周次上限 */
  maxWeek: number;
  /** 时间轴起点年份 */
  startYear: number;
  /** 同 IP 每小时注册上限 */
  registerLimitPerHour: number;
  /** 是否为生产环境 */
  isProduction: boolean;
}

/**
 * 构建服务配置
 * @returns 校验后的配置对象
 * @throws 配置非法时抛错
 */
const buildConfig = (): ServerConfig => ({
  port: readIntEnv('PORT', 3000, 1),
  host: readEnv('HOST', '127.0.0.1'),
  dbPath: resolveDbPath(readEnv('DB_PATH', 'data/weekly.db')),
  sessionDays: readIntEnv('SESSION_DAYS', 30, 1),
  maxWeek: readIntEnv('MAX_WEEK', DEFAULT_MAX_WEEK, 1),
  startYear: readIntEnv('START_YEAR', DEFAULT_START_YEAR, 1970),
  registerLimitPerHour: readIntEnv(
    'REGISTER_LIMIT_PER_HOUR',
    DEFAULT_REGISTER_LIMIT_PER_HOUR,
    1,
  ),
  isProduction: readEnv('NODE_ENV', 'development') === 'production',
});

/** 全局唯一配置实例 */
export const config: ServerConfig = buildConfig();
