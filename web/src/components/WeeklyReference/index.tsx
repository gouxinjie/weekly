/**
 * @component 本周待办
 * @description 右栏抽屉（周报展示态）：展示标记到当前周次的待办清单、本周完成进度与引言卡；
 * 清单为只读展示（保持模块单向），「新建」按钮跳转待办页
 * @author gouxinjie
 * @created 2026-09-18
 * @updated 2026-09-22
 */
import { useEffect, useState } from 'react';
import { fetchTodosByWeek } from '@/api/todo';
import { toErrorMessage } from '@/api/client';
import { formatWeekLabel } from '@/utils/format';
import type { Todo } from '@/types/models';
import styles from './index.module.scss';

/** WeeklyReference 属性 */
interface WeeklyReferenceProps {
  /** 标签周次的 ISO 年 */
  year: number;
  /** 标签周次的 ISO 周次 */
  week: number;
  /** 点击「新建」跳转待办页的回调 */
  onGoTodo: () => void;
}

/**
 * 本周待办
 * @param props - 见 WeeklyReferenceProps
 * @returns 右栏内容节点
 */
const WeeklyReference = ({ year, week, onGoTodo }: WeeklyReferenceProps) => {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    void fetchTodosByWeek(year, week)
      .then((list) => {
        if (active) setTodos(list);
      })
      .catch((err: unknown) => {
        if (active) setError(toErrorMessage(err, '参考内容加载失败'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [year, week]);

  /** 完成进度：已完成条数与总条数 */
  const doneCount = todos.filter((todo) => todo.done).length;
  const percent = todos.length === 0 ? 0 : Math.round((doneCount / todos.length) * 100);

  return (
    <div className={styles.reference}>
      {/* 白色卡片：标题行、周次副标题、清单 / 空态与进度都收在这一张卡里，
          靠底色与投影跟抽屉的浅灰底拉开层次（对齐设计稿） */}
      <section className={styles.card}>
        <div className={styles.header}>
          <h2 className={styles.title}>本周待办</h2>
          <button type="button" className={styles.create} onClick={onGoTodo}>
            ＋ 新建
          </button>
        </div>
        <p className={styles.subtitle}>{formatWeekLabel(year, week)}</p>

        {loading ? <p className={styles.hint}>加载中…</p> : null}
        {!loading && error !== '' ? <p className={styles.error}>{error}</p> : null}

        {!loading && error === '' && todos.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.hint}>本周暂无标记的待办</p>
            <button type="button" className={styles.link} onClick={onGoTodo}>
              去待办添加
            </button>
          </div>
        ) : null}

        {!loading && error === '' && todos.length > 0 ? (
          <>
            <ul className={styles.list}>
              {todos.map((todo) => (
                <li key={todo.id} className={todo.done ? styles.itemDone : styles.item}>
                  {/* 只读状态图标：完成画勾，未完成画空心方块 */}
                  <span
                    className={todo.done ? styles.checkDone : styles.check}
                    aria-label={todo.done ? '已完成' : '未完成'}
                  >
                    {todo.done ? '✓' : ''}
                  </span>
                  {todo.text}
                </li>
              ))}
            </ul>

            {/* 本周完成进度：上方细分隔线隔开清单，标题一行，进度条 + 百分比一行 */}
            <div className={styles.progress}>
              <span className={styles.progressLabel}>
                本周进度 {doneCount}/{todos.length}
              </span>
              <div className={styles.progressRow}>
                <div
                  className={styles.progressBar}
                  role="progressbar"
                  aria-valuenow={percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <span className={styles.progressFill} style={{ width: `${percent}%` }} />
                </div>
                <span className={styles.progressPercent}>{percent}%</span>
              </div>
            </div>
          </>
        ) : null}
      </section>

      {/* 引言卡 */}
      <figure className={styles.quote}>
        <span className={styles.quoteMark} aria-hidden>
          “
        </span>
        <blockquote className={styles.quoteText}>
          每一周，都是新的开始。
          <br />
          记录过去，沉淀成长。
        </blockquote>
      </figure>
    </div>
  );
};

export default WeeklyReference;
