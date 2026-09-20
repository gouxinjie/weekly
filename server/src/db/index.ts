import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from '../config';

/** 确保数据库文件所在目录存在，否则首次启动会因目录缺失而失败 */
fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

/**
 * 数据库连接（单例，进程内共享）
 * 说明：better-sqlite3 是同步原生绑定，只能在 Node 运行时使用。
 */
export const db = new Database(config.dbPath);

/** 开启 WAL，读写不互斥 */
db.pragma('journal_mode = WAL');

/** 开启外键约束：SQLite 默认关闭，不开启则删除用户时其数据不会级联清理 */
db.pragma('foreign_keys = ON');

/**
 * 执行数据库迁移
 * 用 PRAGMA user_version 管理版本；已上线的表结构变更只能追加迁移，不能直接改建表语句。
 * @returns 迁移完成后的版本号
 */
export const migrate = (): number => {
  const current = db.pragma('user_version', { simple: true }) as number;

  if (current < 1) {
    db.exec(`
      -- 用户表：手机号唯一，密码只存 argon2 哈希
      CREATE TABLE user (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        phone         TEXT    NOT NULL UNIQUE,
        password_hash TEXT    NOT NULL,
        created_at    TEXT    NOT NULL
      );

      -- 会话表：随机 token 存库查表，不是 JWT，因此不需要签名密钥
      CREATE TABLE session (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        token      TEXT    NOT NULL UNIQUE,
        user_id    INTEGER NOT NULL,
        created_at TEXT    NOT NULL,
        expires_at TEXT    NOT NULL,
        FOREIGN KEY (user_id) REFERENCES user (id) ON DELETE CASCADE
      );
      CREATE INDEX idx_session_user ON session (user_id);

      -- 周报表：一人一周一篇，唯一约束必须带上 user_id，否则第二个用户无法写同一周
      CREATE TABLE weekly (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    INTEGER NOT NULL,
        year       INTEGER NOT NULL,
        week       INTEGER NOT NULL,
        week_start TEXT    NOT NULL,
        week_end   TEXT    NOT NULL,
        content    TEXT    NOT NULL DEFAULT '',
        created_at TEXT    NOT NULL,
        updated_at TEXT    NOT NULL,
        UNIQUE (user_id, year, week),
        FOREIGN KEY (user_id) REFERENCES user (id) ON DELETE CASCADE
      );

      -- 备忘表：year / week 可为 NULL，为 null 时只是「未标记周次」，不影响任何行为
      CREATE TABLE memo (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    INTEGER NOT NULL,
        text       TEXT    NOT NULL,
        done       INTEGER NOT NULL DEFAULT 0,
        pinned     INTEGER NOT NULL DEFAULT 0,
        year       INTEGER,
        week       INTEGER,
        created_at TEXT    NOT NULL,
        updated_at TEXT    NOT NULL,
        FOREIGN KEY (user_id) REFERENCES user (id) ON DELETE CASCADE
      );
      CREATE INDEX idx_memo_user ON memo (user_id, pinned, done);

      -- 登录 / 注册尝试记录：限流的唯一数据来源
      CREATE TABLE login_attempt (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        scope      TEXT    NOT NULL,
        dimension  TEXT    NOT NULL,
        identifier TEXT    NOT NULL,
        success    INTEGER NOT NULL DEFAULT 0,
        created_at TEXT    NOT NULL
      );
      CREATE INDEX idx_attempt_lookup
        ON login_attempt (scope, dimension, identifier, created_at);
    `);
    db.pragma('user_version = 1');
  }

  return db.pragma('user_version', { simple: true }) as number;
};
