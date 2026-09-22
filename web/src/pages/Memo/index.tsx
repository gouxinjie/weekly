/**
 * @component 工作台（备忘）
 * @description 三栏骨架：左栏页签、左列筛选（占据周报态时间轴那一列）、
 * 中栏标题 + 常驻新建输入框 + 日期分组清单；此态下右栏整栏移除
 * @author gouxinjie
 * @created 2026-09-18
 * @updated 2026-09-22
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toErrorMessage } from '@/api/client';
import { createMemo, deleteMemo, fetchMemos, updateMemo } from '@/api/memo';
import AppLayout from '@/components/AppLayout';
import MemoFilter from '@/components/MemoFilter';
import MemoList from '@/components/MemoList';
import Select from '@/components/Select';
import { MEMO_CATEGORIES } from '@/constants';
import { getCurrentWeek, getMemoWeek, isValidWeek } from '@/utils/week';
import type { UpdateMemoBody } from '@/types/api';
import type { Memo as MemoModel, MemoFilter as MemoFilterValue, WeekRef } from '@/types/models';
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

  /** 路由查询参数：承载从周报页「＋ 新建」带过来的目标周次 */
  const [searchParams] = useSearchParams();

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

  /*
   * 新建待办的默认归属周。
   * 从周报页「＋ 新建 / 去备忘添加」跳过来时 URL 会带上当时查看的周（?year=&week=），
   * 优先沿用它——翻往期周报时新建的备忘该落到那一周，而不是「今天所在的周」；
   * 没有参数或参数非法（含缺一个、非整数、越界）时回落到当前 ISO 周。
   */
  const defaultWeek = useMemo<WeekRef>(() => {
    const year = Number(searchParams.get('year'));
    const week = Number(searchParams.get('week'));
    return isValidWeek(year, week) ? { year, week } : currentWeek;
  }, [searchParams, currentWeek]);

  /** 默认归属周的展示文案：跨年时补上年份末两位，与清单行上的周次标签口径一致 */
  const defaultWeekLabel =
    defaultWeek.year === currentWeek.year
      ? `第 ${defaultWeek.week} 周`
      : `第 ${defaultWeek.week} 周 · ${String(defaultWeek.year).slice(-2)}`;

  /**
   * 是否属于本周：所属周（手动标记优先，未标记按创建时间推导）与当前 ISO 周一致。
   * 与清单分组的口径必须完全一致，否则会出现「这条在『本周』分组里，却不在『本周』筛选里」。
   */
  const isCurrentWeek = useCallback(
    (memo: MemoModel): boolean => {
      const week = getMemoWeek(memo);
      return week.year === currentWeek.year && week.week === currentWeek.week;
    },
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
      // 新建的待办默认标记到 defaultWeek（周报页带过来的周，否则当前 ISO 周）：
      // 备忘是「按周攒素材」的东西，留空会导致它既不出现在「本周」筛选里，
      // 也进不了周报右栏的「本周参考」。需要归属其它周时，创建后在「⋯」菜单改标记。
      const created = await createMemo({
        text,
        category: newCategory,
        year: defaultWeek.year,
        week: defaultWeek.week,
      });
      setMemos((prev) => [...prev, created]);
      setNewText('');
      newInputRef.current?.focus();
    } catch (err) {
      setError(toErrorMessage(err, '添加失败，请稍后重试'));
    } finally {
      setPending(false);
    }
  }, [newText, newCategory, pending, defaultWeek]);

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
        return '本周没有待办';
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
    <AppLayout
      activeTab="memo"
      // 筛选放在左列：与周报态的时间轴占同一列，切换标签页时列本身不位移
      leftColumn={<MemoFilter value={filter} counts={counts} onChange={setFilter} />}
    >
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

      {/* 新建输入行：输入框 + 分类选择 + 默认归属周 + 添加 */}
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
        {/* 默认归属周：新建的待办会被标记到这一周，需要改就创建后用「⋯」菜单改标记 */}
        <span
          className={styles.composerWeek}
          title={`新建的待办默认标记到 ${defaultWeek.year} 年第 ${defaultWeek.week} 周；需要归属其它周时，创建后在「⋯」菜单改标记`}
        >
          {defaultWeekLabel}
        </span>
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
