/**
 * @component 备忘清单
 * @description 三段分组（置顶 / 未完成 / 已完成）的待办清单，支持勾选、就地编辑、删除、置顶与周次标记
 * @author gouxinjie
 * @created 2026-09-18
 * @updated 2026-09-18
 */
import { useMemo, useState } from 'react';
import { MAX_WEEK, START_YEAR } from '@/constants';
import { formatWeekLabel } from '@/utils/format';
import { getCurrentWeek, isPastWeek } from '@/utils/week';
import type { UpdateMemoBody } from '@/types/api';
import type { Memo } from '@/types/models';
import styles from './index.module.scss';

/** 空态动作 */
interface EmptyAction {
  /** 动作文案 */
  label: string;
  /** 点击回调 */
  onClick: () => void;
}

/** MemoList 属性 */
interface MemoListProps {
  /** 已按筛选条件过滤后的备忘 */
  memos: Memo[];
  /** 是否正在加载 */
  loading: boolean;
  /** 局部更新某条备忘 */
  onUpdate: (memo: Memo, patch: Partial<UpdateMemoBody>) => void;
  /** 删除某条备忘 */
  onDelete: (memo: Memo) => void;
  /** 空态文案 */
  emptyHint: string;
  /** 空态附带的动作，可选 */
  emptyAction?: EmptyAction;
}

/** MemoItem 属性 */
interface MemoItemProps {
  /** 备忘条目 */
  memo: Memo;
  /** 局部更新回调 */
  onUpdate: (memo: Memo, patch: Partial<UpdateMemoBody>) => void;
  /** 删除回调 */
  onDelete: (memo: Memo) => void;
  /** 周次标记可选的年份列表 */
  yearOptions: number[];
}

/**
 * 单条备忘
 * @param props - 见 MemoItemProps
 * @returns 条目节点
 */
const MemoItem = ({ memo, onUpdate, onDelete, yearOptions }: MemoItemProps) => {
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState(memo.text);
  const [tagging, setTagging] = useState(false);
  const [draftYear, setDraftYear] = useState(memo.year ?? getCurrentWeek().year);
  const [draftWeek, setDraftWeek] = useState(memo.week ?? getCurrentWeek().week);
  const [error, setError] = useState('');

  const tagged = memo.year !== null && memo.week !== null;

  /** 过期高亮：标记周次已过且未完成，仅视觉提示，不改变分组、不推提醒 */
  const overdue = !memo.done && tagged && isPastWeek(memo.year as number, memo.week as number);

  /** 提交文本编辑 */
  const commitText = (): void => {
    const next = draftText.trim();
    if (next === '') {
      setError('待办内容不能为空');
      setDraftText(memo.text);
      setEditing(false);
      return;
    }
    setError('');
    setEditing(false);
    if (next !== memo.text) {
      onUpdate(memo, { text: next });
    }
  };

  return (
    <li className={overdue ? styles.itemOverdue : styles.item}>
      <div className={styles.main}>
        <input
          type="checkbox"
          className={styles.checkbox}
          checked={memo.done}
          onChange={() => onUpdate(memo, { done: !memo.done })}
          aria-label={memo.done ? '标记为未完成' : '标记为已完成'}
        />

        {editing ? (
          <input
            className={styles.textInput}
            value={draftText}
            autoFocus
            onChange={(event) => setDraftText(event.target.value)}
            onBlur={commitText}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitText();
              if (event.key === 'Escape') {
                setDraftText(memo.text);
                setEditing(false);
              }
            }}
          />
        ) : (
          <button
            type="button"
            className={memo.done ? styles.textDone : styles.text}
            onClick={() => {
              setDraftText(memo.text);
              setEditing(true);
            }}
            title="点击编辑"
          >
            {memo.text}
          </button>
        )}
      </div>

      <div className={styles.meta}>
        {tagged ? (
          <span className={styles.tag}>
            {formatWeekLabel(memo.year as number, memo.week as number)}
          </span>
        ) : null}

        <button
          type="button"
          className={styles.action}
          onClick={() => setTagging(!tagging)}
          title="标记所属周次"
        >
          {tagged ? '改标记' : '标记周'}
        </button>
        <button
          type="button"
          className={memo.pinned ? styles.actionActive : styles.action}
          onClick={() => onUpdate(memo, { pinned: !memo.pinned })}
          title={memo.pinned ? '取消置顶' : '置顶'}
        >
          {memo.pinned ? '已置顶' : '置顶'}
        </button>
        <button
          type="button"
          className={styles.actionDanger}
          onClick={() => onDelete(memo)}
          title="删除"
        >
          删除
        </button>
      </div>

      {tagging ? (
        <div className={styles.tagPanel}>
          <select
            className={styles.select}
            value={draftYear}
            onChange={(event) => setDraftYear(Number(event.target.value))}
          >
            {yearOptions.map((item) => (
              <option key={item} value={item}>
                {item} 年
              </option>
            ))}
          </select>
          <select
            className={styles.select}
            value={draftWeek}
            onChange={(event) => setDraftWeek(Number(event.target.value))}
          >
            {Array.from({ length: MAX_WEEK }, (_, index) => index + 1).map((item) => (
              <option key={item} value={item}>
                第 {item} 周
              </option>
            ))}
          </select>
          <button
            type="button"
            className={styles.action}
            onClick={() => {
              setTagging(false);
              onUpdate(memo, { year: draftYear, week: draftWeek });
            }}
          >
            保存
          </button>
          <button
            type="button"
            className={styles.action}
            onClick={() => {
              setTagging(false);
              onUpdate(memo, { year: null, week: null });
            }}
          >
            清除
          </button>
        </div>
      ) : null}

      {error !== '' ? <p className={styles.error}>{error}</p> : null}
    </li>
  );
};

/**
 * 备忘清单
 * @param props - 见 MemoListProps
 * @returns 分组清单节点
 */
const MemoList = ({
  memos,
  loading,
  onUpdate,
  onDelete,
  emptyHint,
  emptyAction,
}: MemoListProps) => {
  const [doneCollapsed, setDoneCollapsed] = useState(true);

  /** 年份可选项：从起点年份到当前年份 */
  const yearOptions = useMemo(() => {
    const endYear = Math.max(getCurrentWeek().year, START_YEAR);
    const options: number[] = [];
    for (let year = START_YEAR; year <= endYear; year += 1) {
      options.push(year);
    }
    return options;
  }, []);

  const groups = useMemo(() => {
    const done = memos.filter((memo) => memo.done);
    const active = memos.filter((memo) => !memo.done);
    return {
      done,
      pinned: active.filter((memo) => memo.pinned),
      undone: active.filter((memo) => !memo.pinned),
    };
  }, [memos]);

  if (loading) {
    return <p className={styles.hint}>加载中…</p>;
  }

  if (memos.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.hint}>{emptyHint}</p>
        {emptyAction !== undefined ? (
          <button type="button" className={styles.link} onClick={emptyAction.onClick}>
            {emptyAction.label}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={styles.list}>
      {groups.pinned.length > 0 ? (
        <section className={styles.group}>
          <h3 className={styles.groupTitle}>置顶</h3>
          <ul>
            {groups.pinned.map((memo) => (
              <MemoItem
                key={memo.id}
                memo={memo}
                onUpdate={onUpdate}
                onDelete={onDelete}
                yearOptions={yearOptions}
              />
            ))}
          </ul>
        </section>
      ) : null}

      <section className={styles.group}>
        <h3 className={styles.groupTitle}>未完成 · {groups.undone.length}</h3>
        {groups.undone.length === 0 ? (
          <p className={styles.hint}>没有未完成的待办</p>
        ) : (
          <ul>
            {groups.undone.map((memo) => (
              <MemoItem
                key={memo.id}
                memo={memo}
                onUpdate={onUpdate}
                onDelete={onDelete}
                yearOptions={yearOptions}
              />
            ))}
          </ul>
        )}
      </section>

      <section className={styles.group}>
        <button
          type="button"
          className={styles.groupToggle}
          onClick={() => setDoneCollapsed(!doneCollapsed)}
        >
          <span className={doneCollapsed ? styles.caret : styles.caretOpen}>▸</span>
          已完成 · {groups.done.length}
        </button>
        {doneCollapsed ? null : (
          <ul>
            {groups.done.map((memo) => (
              <MemoItem
                key={memo.id}
                memo={memo}
                onUpdate={onUpdate}
                onDelete={onDelete}
                yearOptions={yearOptions}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default MemoList;
