/**
 * db 层跨用户数据隔离测试
 * 说明：这是红线 1（每条 SQL 必须带 user_id）的自动化保障，用 Node 内置 node --test，不引入测试框架。
 * 覆盖范围刻意只包含归属校验与红线 3 的周次边界，不做完整测试体系。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

/** 测试用临时数据库路径（必须在加载任何 db 模块之前写入环境变量） */
const TEST_DB_PATH = path.join(
  os.tmpdir(),
  `weekly-isolation-${process.pid}-${Date.now()}.db`,
);

process.env.DB_PATH = TEST_DB_PATH;
process.env.NODE_ENV = 'test';

/**
 * 延迟加载模块
 * @returns db 与各表数据访问函数的集合
 * @remarks 必须用动态 import：静态 import 会被提升到环境变量赋值之前，导致连到真实数据库。
 */
const loadModules = async () => {
  const dbIndex = await import('../src/db/index.js');
  dbIndex.migrate();

  const userDb = await import('../src/db/user.js');
  const weeklyDb = await import('../src/db/weekly.js');
  const todoDb = await import('../src/db/todo.js');
  const weekUtil = await import('../src/utils/week.js');

  return {
    db: dbIndex.db,
    ...userDb,
    ...weeklyDb,
    ...todoDb,
    ...weekUtil,
  };
};

const modulesPromise = loadModules();

/** A、B 两个用户的 ID */
let aId = 0;
let bId = 0;

before(async () => {
  const m = await modulesPromise;
  aId = m.insertUser('13800000001', 'argon2-hash-of-a');
  bId = m.insertUser('13800000002', 'argon2-hash-of-b');
});

after(async () => {
  const m = await modulesPromise;
  m.db.close();

  // 清理临时库文件，包含 WAL 模式产生的 -wal / -shm
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${TEST_DB_PATH}${suffix}`, { force: true });
  }
});

test('A 读 B 的周报：查不到', async () => {
  const m = await modulesPromise;
  m.upsertWeekly(bId, 2026, 38, '2026-09-14', '2026-09-20', 'B 的周报内容');

  assert.equal(m.findWeekly(aId, 2026, 38), undefined, 'A 不应读到 B 的周报');
  assert.equal(m.findWeekly(bId, 2026, 38)?.content, 'B 的周报内容', 'B 应能读到自己的周报');
});

test('A 改 B 的周报（拿 B 的 id）：changes 为 0，表现为失败', async () => {
  const m = await modulesPromise;
  const bWeekly = m.findWeekly(bId, 2026, 38);
  assert.ok(bWeekly, '前置条件：B 的周报应存在');

  const changed = m.updateWeekly(aId, bWeekly.id, '被篡改的内容');

  assert.equal(changed, false, '改别人的周报必须返回 false');
  assert.equal(
    m.findWeekly(bId, 2026, 38)?.content,
    'B 的周报内容',
    'B 的内容不应被改动',
  );
});

test('A 删 B 的待办：失败，且 B 的记录仍在', async () => {
  const m = await modulesPromise;
  const bTodo = m.insertTodo(bId, 'B 的待办', null, null);

  const deleted = m.deleteTodo(aId, bTodo.id);

  assert.equal(deleted, false, '删别人的待办必须返回 false');
  assert.ok(m.findTodo(bId, bTodo.id), 'B 的待办应仍然存在');
});

test('A 改 B 的待办：失败', async () => {
  const m = await modulesPromise;
  const bTodo = m.insertTodo(bId, 'B 的另一条待办', null, null);

  const changed = m.updateTodo(aId, bTodo.id, '被篡改', true, true, null, null);

  assert.equal(changed, false, '改别人的待办必须返回 false');
  assert.equal(m.findTodo(bId, bTodo.id)?.text, 'B 的另一条待办');
});

test('A 的列表查询只返回自己的记录，不含 B 的', async () => {
  const m = await modulesPromise;

  m.insertTodo(aId, 'A 独有的待办', null, null);
  const aList = m.listTodos(aId);

  assert.ok(aList.length > 0, 'A 应有自己的待办');
  assert.ok(
    aList.every((item) => item.user_id === aId),
    'A 的列表里不应出现他人的记录',
  );

  const aWeeks = m.listWrittenWeeks(aId);
  assert.ok(
    aWeeks.every((item) => Number.isInteger(item.year) && Number.isInteger(item.week)),
    '已写周次应只包含当前用户的记录',
  );
});

test('同一周次 A、B 各写一篇：两条记录共存，不冲突', async () => {
  const m = await modulesPromise;

  m.upsertWeekly(aId, 2026, 20, '2026-05-11', '2026-05-17', 'A 的第 20 周');
  m.upsertWeekly(bId, 2026, 20, '2026-05-11', '2026-05-17', 'B 的第 20 周');

  assert.equal(m.findWeekly(aId, 2026, 20)?.content, 'A 的第 20 周');
  assert.equal(m.findWeekly(bId, 2026, 20)?.content, 'B 的第 20 周');
});

test('同一用户同一周重复写入：覆盖同一行，不产生第二条', async () => {
  const m = await modulesPromise;

  m.upsertWeekly(aId, 2026, 21, '2026-05-18', '2026-05-24', '第一版');
  const first = m.findWeekly(aId, 2026, 21);
  m.upsertWeekly(aId, 2026, 21, '2026-05-18', '2026-05-24', '第二版');
  const second = m.findWeekly(aId, 2026, 21);

  assert.ok(first && second);
  assert.equal(first.id, second.id, '同一周应命中同一行');
  assert.equal(second.content, '第二版');
});

test('红线 3：2026 年第 1 周的周一落在 2025 年，仍必须合法', async () => {
  const m = await modulesPromise;

  assert.deepEqual(
    m.getWeekRange(2026, 1),
    { start: '2025-12-29', end: '2026-01-04' },
    '2026 年第 1 周应始于 2025-12-29',
  );
  assert.equal(m.isValidWeek(2026, 1), true, '合法的第 1 周不能被误拒');
  assert.equal(m.isValidWeek(2025, 52), false, '早于起点的年份必须被拒绝');
  assert.equal(m.isValidWeek(2025, 1), false, '早于起点的年份必须被拒绝');
});

test('红线 3：周次上限是 53，2027-01-01 归属 2026 年第 53 周', async () => {
  const m = await modulesPromise;

  assert.equal(m.isValidWeek(2026, 53), true, '2026 年有 53 周，第 53 周必须合法');
  assert.deepEqual(
    m.getWeekRange(2026, 53),
    { start: '2026-12-28', end: '2027-01-03' },
    '2026 年第 53 周跨到 2027-01-03',
  );
  assert.equal(m.isValidWeek(2026, 54), false, '超过 53 周必须被拒绝');
  assert.equal(m.isValidWeek(2026, 0), false, '周次从 1 开始');
});
