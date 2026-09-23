/**
 * weekly 数据库一致性备份
 *
 * 用法：node /var/www/weekly/deploy/backup.cjs [保留天数]
 *
 * 为什么不用系统 sqlite3 CLI：
 *   线上 sqlite3 为 3.26（2018），而 VACUUM INTO 是 SQLite 3.27 才引入的，
 *   直接调用会报语法错误；项目依赖的 better-sqlite3 内置较新的 SQLite，
 *   与运行时版本一致，因此备份统一走 Node，不受系统包版本影响。
 *
 * 为什么必须用 VACUUM INTO、不能直接 cp：
 *   WAL 模式下数据库由 .db + -wal 组成，直接复制 .db 可能拿到不一致快照。
 *
 * 由 deploy/backup.sh 调用（cron 与发布脚本都走同一条路径），也可单独执行。
 */
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

/** 应用根目录，与 ecosystem.config.cjs、release.sh 保持一致 */
const APP_DIR = '/var/www/weekly';

/** 数据库与备份目录 */
const DB_FILE = path.join(APP_DIR, 'data', 'weekly.db');
const BACKUP_DIR = path.join(APP_DIR, 'backup');

/**
 * 以 server/package.json 为基准解析依赖
 * 说明：backup.cjs 位于 deploy/，就近向上找不到 node_modules，
 * 必须显式指定解析基准，否则 require('better-sqlite3') 会失败。
 */
const serverRequire = createRequire(path.join(APP_DIR, 'server', 'package.json'));

/** 保留天数，默认 30 天；超期备份自动清理 */
const keepDays = Number(process.argv[2] ?? 30);

/**
 * 生成本地日期戳
 * @returns 形如 2026-09-23 的字符串（按服务器时区，与 cron 语义一致）
 */
const today = (() => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
})();

if (!fs.existsSync(DB_FILE)) {
  console.error(`[备份] [错误] 数据库不存在：${DB_FILE}`);
  process.exit(1);
}

let Database;
try {
  Database = serverRequire('better-sqlite3');
} catch {
  console.error('[备份] [错误] 未找到 better-sqlite3，请先在 server/ 执行 npm ci --omit=dev');
  process.exit(1);
}

fs.mkdirSync(BACKUP_DIR, { recursive: true });

const target = path.join(BACKUP_DIR, `weekly-${today}.db`);

// 目标文件已存在时 VACUUM INTO 会直接失败，因此先删掉当天旧备份
fs.rmSync(target, { force: true });

const db = new Database(DB_FILE);
try {
  // 路径中的单引号按 SQL 规则转义；路径由本脚本生成，不接受外部输入
  db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
} finally {
  db.close();
}

console.log(`[备份] 完成：${target}`);

// 清理超期备份：只认本脚本生成的命名，避免误删目录里的其他文件
const expireBefore = Date.now() - keepDays * 24 * 60 * 60 * 1000;
let removed = 0;

for (const name of fs.readdirSync(BACKUP_DIR)) {
  if (!/^weekly-\d{4}-\d{2}-\d{2}\.db$/.test(name)) continue;

  const file = path.join(BACKUP_DIR, name);
  if (fs.statSync(file).mtimeMs < expireBefore) {
    fs.rmSync(file, { force: true });
    removed += 1;
  }
}

console.log(`[备份] 已清理 ${removed} 个超期备份（保留 ${keepDays} 天）`);
