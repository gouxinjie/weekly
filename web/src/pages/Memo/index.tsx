/**
 * @component 工作台（备忘）
 * @description 两栏骨架：左栏页签、中栏标题 + 筛选标签页 + 常驻新建输入框 + 日期分组清单；
 * 此态下右栏整栏移除
 * @author gouxinjie
 * @created 2026-09-18
 * @updated 2026-09-20
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toErrorMessage } from '@/api/client';
import { createMemo, deleteMemo, fetchMemos, updateMemo } from '@/api/memo';
import AppLayout from '@/components/AppLayout';
import MemoFilter from '@/components/MemoFilter';
import MemoList from '@/components/MemoList';
import Select from '@/components/Select';
import { MEMO_CATEGORIES } from '@/constants';
import { getCurrentWeek } from '@/utils/week';
import type { UpdateMemoBody } from '@/types/api';
import type { Memo as MemoModel, MemoFilter as MemoFilterValue } from '@/types/models';
import styles from './index.module.scss';

/**
 * 工作台（备忘）
 * @returns 页面节点
 */
const Memo = () => {
  const [memos, setMemos] = useState<MemoModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<MemoFilterValue>('all');
  const [keyword, setKeyword] = useState('');
  const [newText, setNewText] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [pending, setPending] = useState(false);

  const newInputRef = useRef<HTMLInputElement | null>(null);

  // 首次加载全部备忘
  useEffect(() => {
    let active = true;

    void fetchMemos()
      .then((list) => {
        if (active) setMemos(list);
      })
      .catch((err: unknown) => {
        if (active) setError(toErrorMessage(err, '加载失败，请稍后重试'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  /** 当前 ISO 周：筛选与计数共用，避免每次比较都重新构造 dayjs 对象 */
  const currentWeek = useMemo(() => getCurrentWeek(), []);

  /** 是否属于本周：标记的 year + week 与当前 ISO 周一致 */
  const isCurrentWeek = useCallback(
    (memo: MemoModel): boolean =>
      memo.year === currentWeek.year && memo.week === currentWeek.week,
    [currentWeek],
  );

  /** 各筛选结果与计数 */
  const counts = useMemo<Record<MemoFilterValue, number>>(
    () => ({
      all: memos.length,
      week: memos.filter(isCurrentWeek).length,
      undone: memos.filter((memo) => !memo.done).length,
      done: memos.filter((memo) => memo.done).length,
    }),
    [memos, isCurrentWeek],
  );

  /** 先按状态筛选，再按关键词过滤（关键词仅在前端本地过滤，不额外请求接口） */
  const filtered = useMemo(() => {
    const byStatus = ((): MemoModel[] => {
      switch (filter) {
        case 'week':
          return memos.filter(isCurrentWeek);
        case 'undone':
          return memos.filter((memo) => !memo.done);
        case 'done':
          return memos.filter((memo) => memo.done);
        default:
          return memos;
      }
    })();

    const text = keyword.trim().toLowerCase();
    if (text === '') return byStatus;
    return byStatus.filter((memo) => memo.text.toLowerCase().includes(text));
  }, [memos, filter, isCurrentWeek, keyword]);

  /** 新建待办，Enter 触发且保持焦点 */
  const handleCreate = useCallback(async (): Promise<void> => {
    const text = newText.trim();
    if (text === '' || pending) return;

    setPending(true);
    setError('');
    try {
      const created = await createMemo({ text, category: newCategory });
      setMemos((prev) => [...prev, created]);
      setNewText('');
      newInputRef.current?.focus();
    } catch (err) {
      setError(toErrorMessage(err, '添加失败，请稍后重试'));
    } finally {
      setPending(false);
    }
  }, [newText, newCategory, pending]);

  /**
   * 局部更新某条备忘（乐观更新，失败回滚）
   * @param memo - 目标备忘
   * @param patch - 需要变更的字段
   * @returns 无
   */
  const handleUpdate = useCallback(
    async (memo: MemoModel, patch: Partial<UpdateMemoBody>): Promise<void> => {
      const body: UpdateMemoBody = {
        text: patch.text ?? memo.text,
        done: patch.done ?? memo.done,
        pinned: patch.pinned ?? memo.pinned,
        // year / week 允许显式传 null，因此不能用 ?? 判断
        year: patch.year !== undefined ? patch.year : memo.year,
        week: patch.week !== undefined ? patch.week : memo.week,
        category: patch.category ?? memo.category,
      };

      const snapshot = memos;
      setError('');
      setMemos((prev) => prev.map((item) => (item.id === memo.id ? { ...item, ...body } : item)));

      try {
        await updateMemo(memo.id, body);
      } catch (err) {
        setMemos(snapshot);
        setError(toErrorMessage(err, '更新失败，请稍后重试'));
      }
    },
    [memos],
  );

  /**
   * 删除某条备忘（乐观更新，失败回滚）
   * @param memo - 目标备忘
   * @returns 无
   */
  const handleDelete = useCallback(
    async (memo: MemoModel): Promise<void> => {
      const snapshot = memos;
      setError('');
      setMemos((prev) => prev.filter((item) => item.id !== memo.id));

      try {
        await deleteMemo(memo.id);
      } catch (err) {
        setMemos(snapshot);
        setError(toErrorMessage(err, '删除失败，请稍后重试'));
      }
    },
    [memos],
  );

  /** 空态文案与动作：区分「整体为空」「搜索无结果」与「某筛选结果为空」 */
  const emptyHint = useMemo(() => {
    if (memos.length === 0) return '还没有待办，在上面输入一条试试';
    if (keyword.trim() !== '') return '没有匹配的待办';
    switch (filter) {
      case 'week':
        return '本周没有标记的待办';
      case 'undone':
        return '所有待办都已完成';
      case 'done':
        return '还没有已完成的待办';
      default:
        return '还没有待办';
    }
  }, [memos.length, filter, keyword]);

  const emptyAction = useMemo(() => {
    if (memos.length === 0) {
      return { label: '去输入', onClick: () => newInputRef.current?.focus() };
    }
    if (keyword.trim() !== '') {
      return { label: '清空搜索', onClick: () => setKeyword('') };
    }
    if (filter !== 'all') {
      return { label: '查看全部', onClick: () => setFilter('all') };
    }
    return undefined;
  }, [memos.length, filter, keyword]);

  return (
    <AppLayout activeTab="memo">
      {/* 标题行：备忘 + 搜索框 + 新建按钮 */}
      <header className={styles.header}>
        <h1 className={styles.title}>备忘</h1>

        <div className={styles.headerRight}>
          {/* 搜索框：仅在已加载的备忘里做前端过滤，不额外请求接口 */}
          <label className={styles.searchField}>
            <svg
              className={styles.searchIcon}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden
            >
              <circle cx="11" cy="11" r="6.4" />
              <path d="m15.8 15.8 3.7 3.7" strokeLinecap="round" />
            </svg>
            <input
              className={styles.searchInput}
              value={keyword}
              placeholder="搜索备忘内容…"
              aria-label="搜索备忘内容"
              onChange={(event) => setKeyword(event.target.value)}
            />
          </label>

          <button
            type="button"
            className={styles.create}
            onClick={() => newInputRef.current?.focus()}
          >
            ＋ 新建
          </button>
        </div>
      </header>

      {/* 筛选标签页 */}
      <div className={styles.filterRow}>
        <MemoFilter value={filter} counts={counts} onChange={setFilter} />
      </div>

      {/* 新建输入行：输入框 + 分类选择 + 添加 */}
      <div className={styles.composer}>
        <input
          ref={newInputRef}
          className={styles.composerInput}
          value={newText}
          placeholder="输入一条待办，回车即添加"
          maxLength={500}
          onChange={(event) => setNewText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void handleCreate();
            }
          }}
        />
        <Select
          value={newCategory}
          options={MEMO_CATEGORIES}
          ariaLabel="选择分类"
          onChange={setNewCategory}
        />
        <button
          type="button"
          className={styles.composerButton}
          disabled={pending || newText.trim() === ''}
          onClick={() => void handleCreate()}
        >
          添加
        </button>
      </div>

      {error !== '' ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.body}>
        <MemoList
          memos={filtered}
          loading={loading}
          onUpdate={(memo, patch) => void handleUpdate(memo, patch)}
          onDelete={(memo) => void handleDelete(memo)}
          emptyHint={emptyHint}
          emptyAction={emptyAction}
        />
      </div>
    </AppLayout>
  );
};

export default Memo;
