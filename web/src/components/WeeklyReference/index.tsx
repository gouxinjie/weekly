/**
 * @component 本周参考
 * @description 右栏只读抽屉：展示标记到当前周次的备忘条目，不可在此勾选或编辑（保持模块单向）
 * @author gouxinjie
 * @created 2026-09-18
 * @updated 2026-09-18
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
  /** 点击「去备忘添加」的回调 */
  onGoMemo: () => void;
}

/**
 * 本周参考
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

  return (
    <div className={styles.reference}>
      <h2 className={styles.title}>本周参考</h2>
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
        <ul className={styles.list}>
          {memos.map((memo) => (
            <li key={memo.id} className={memo.done ? styles.itemDone : styles.item}>
              {memo.text}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};

export default WeeklyReference;
