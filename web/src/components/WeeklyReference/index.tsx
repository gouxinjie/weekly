/**
 * @component 本周备忘
 * @description 右栏抽屉（周报展示态）：展示标记到当前周次的备忘清单、本周完成进度与引言卡；
 * 清单为只读展示（保持模块单向），「新建」按钮跳转备忘页
 * @author gouxinjie
 * @created 2026-09-18
 * @updated 2026-09-20
 */
import { useEffect, useState } from 'react';
import { fetchMemosByWeek } from '@/api/memo';
import { toErrorMessage } from '@/api/client';
import { formatWeekLabel } from '@/utils/format';
import type { Memo } from '@/types/models';
import styles from './index.module.scss';

/** WeeklyReference 属性 */
interface WeeklyReferenceProps {
  /** 标签周次的 ISO 年 */
  year: number;
  /** 标签周次的 ISO 周次 */
  week: number;
  /** 点击「新建」跳转备忘页的回调 */
  onGoMemo: () => void;
}

/**
 * 本周备忘
 * @param props - 见 WeeklyReferenceProps
 * @returns 右栏内容节点
 */
const WeeklyReference = ({ year, week, onGoMemo }: WeeklyReferenceProps) => {
  const [memos, setMemos] = useState<Memo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    void fetchMemosByWeek(year, week)
      .then((list) => {
        if (active) setMemos(list);
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
  const doneCount = memos.filter((memo) => memo.done).length;
  const percent = memos.length === 0 ? 0 : Math.round((doneCount / memos.length) * 100);

  return (
    <div className={styles.reference}>
      <div className={styles.header}>
        <h2 className={styles.title}>本周备忘</h2>
        <button type="button" className={styles.create} onClick={onGoMemo}>
          ＋ 新建
        </button>
      </div>
      <p className={styles.subtitle}>{formatWeekLabel(year, week)}</p>

      {loading ? <p className={styles.hint}>加载中…</p> : null}
      {!loading && error !== '' ? <p className={styles.error}>{error}</p> : null}

      {!loading && error === '' && memos.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.hint}>本周暂无标记的备忘</p>
          <button type="button" className={styles.link} onClick={onGoMemo}>
            去备忘添加
          </button>
        </div>
      ) : null}

      {!loading && error === '' && memos.length > 0 ? (
        <>
          <ul className={styles.list}>
            {memos.map((memo) => (
              <li key={memo.id} className={memo.done ? styles.itemDone : styles.item}>
                {/* 只读状态图标：完成画勾，未完成画空心方块 */}
                <span
                  className={memo.done ? styles.checkDone : styles.check}
                  aria-label={memo.done ? '已完成' : '未完成'}
                >
                  {memo.done ? '✓' : ''}
                </span>
                {memo.text}
              </li>
            ))}
          </ul>

          {/* 本周完成进度 */}
          <div className={styles.progress}>
            <div className={styles.progressHead}>
              <span>本周进度 {doneCount}/{memos.length}</span>
              <span className={styles.progressPercent}>{percent}%</span>
            </div>
            <div
              className={styles.progressBar}
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span className={styles.progressFill} style={{ width: `${percent}%` }} />
            </div>
          </div>
        </>
      ) : null}

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
