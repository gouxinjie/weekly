/**
 * @component 备忘清单
 * @description 按创建日期分组（今天 / 昨天 / 具体日期）的待办清单，支持勾选、就地编辑、删除、
 * 置顶、周次标记与分类标签（产品 / 开发 / 测试 / 文档 / 生活）
 * @author gouxinjie
 * @created 2026-09-18
 * @updated 2026-09-20
 */
import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import Select from '@/components/Select';
import type { SelectOption } from '@/components/Select';
import { MAX_WEEK, MEMO_CATEGORIES, START_YEAR } from '@/constants';
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

/** 日期分组 */
interface DateGroup {
  /** 分组键：YYYY-MM-DD */
  key: string;
  /** 展示标签：今天 / 昨天 / MM-DD */
  label: string;
  /** 该组备忘 */
  memos: Memo[];
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
  yearOptions: SelectOption[];
  /** 菜单是否展开（受控，保证同一时间只展开一个菜单） */
  menuOpen: boolean;
  /** 切换菜单展开状态 */
  onToggleMenu: () => void;
}

/** 分类标识 → 样式类名映射（CSS Modules 不便动态拼接，显式映射） */
const CATEGORY_CLASS: Record<string, string> = {
  product: styles.catProduct,
  dev: styles.catDev,
  test: styles.catTest,
  doc: styles.catDoc,
  life: styles.catLife,
};

/** 分类标识 → 展示文案映射 */
const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  MEMO_CATEGORIES.map((item) => [item.value, item.label]),
);

/** 周次可选项：一年最多 53 周，与 props 和状态无关，放在模块级避免每次渲染重建 */
const WEEK_OPTIONS: SelectOption[] = Array.from({ length: MAX_WEEK }, (_, index) => ({
  value: String(index + 1),
  label: `第 ${index + 1} 周`,
}));

/**
 * 生成分组的展示标签
 * @param key - 分组键 YYYY-MM-DD
 * @returns 相对日期标签：今天 / 昨天 / 明天；非近期日期返回空串
 */
const relativeDayLabel = (key: string): string => {
  const date = dayjs(key);
  const today = dayjs().startOf('day');
  if (date.isSame(today)) return '今天';
  if (date.isSame(today.subtract(1, 'day'))) return '昨天';
  if (date.isSame(today.add(1, 'day'))) return '明天';
  return '';
};

/**
 * 生成分组的完整标题
 * @param key - 分组键 YYYY-MM-DD
 * @returns 形如「今天 · 09/22」或「09/20」的字符串
 */
const groupTitle = (key: string): string => {
  const date = dayjs(key);
  const relative = relativeDayLabel(key);
  return relative === '' ? date.format('MM/DD') : `${relative} · ${date.format('MM/DD')}`;
};

/**
 * 单条备忘
 * @param props - 见 MemoItemProps
 * @returns 条目节点
 */
const MemoItem = ({ memo, onUpdate, onDelete, yearOptions, menuOpen, onToggleMenu }: MemoItemProps) => {
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

  /**
   * 菜单项公共行为：先收起菜单再执行动作
   * @param action - 菜单动作
   * @returns 无
   */
  const runMenuAction = (action: () => void): void => {
    onToggleMenu();
    action();
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

        <div className={styles.meta}>
          {/* 分类标签：彩色胶囊 */}
          {memo.category !== '' ? (
            <span className={`${styles.category} ${CATEGORY_CLASS[memo.category] ?? ''}`}>
              {CATEGORY_LABEL[memo.category] ?? memo.category}
            </span>
          ) : null}

          {/* 周次标记标签：带上年份末两位，跨年标记才不会混淆 */}
          {tagged ? (
            <span className={styles.weekTag} title={`标记到 ${memo.year} 年第 ${memo.week} 周`}>
              第 {memo.week} 周 · {String(memo.year).slice(-2)}
            </span>
          ) : null}

          {/* 「⋯」菜单 */}
          <div className={styles.menuWrap}>
            <button
              type="button"
              className={styles.menuButton}
              onClick={onToggleMenu}
              aria-label="更多操作"
              aria-expanded={menuOpen}
            >
              ⋯
            </button>

            {menuOpen ? (
              <div className={styles.menu}>
                <button
                  type="button"
                  className={styles.menuItem}
                  onClick={() => runMenuAction(() => setTagging(!tagging))}
                >
                  {tagged ? '改标记' : '标记周次'}
                </button>
                <button
                  type="button"
                  className={styles.menuItem}
                  onClick={() => runMenuAction(() => onUpdate(memo, { pinned: !memo.pinned }))}
                >
                  {memo.pinned ? '取消置顶' : '置顶'}
                </button>
                <div className={styles.menuCategories}>
                  {MEMO_CATEGORIES.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={
                        memo.category === option.value
                          ? styles.menuCatActive
                          : styles.menuCat
                      }
                      onClick={() => runMenuAction(() => onUpdate(memo, { category: option.value }))}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className={`${styles.menuItem} ${styles.menuItemDanger}`}
                  onClick={() => runMenuAction(() => onDelete(memo))}
                >
                  删除
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {memo.pinned ? <span className={styles.pinMark}>置顶</span> : null}

      {tagging ? (
        <div className={styles.tagPanel}>
          <Select
            value={String(draftYear)}
            options={yearOptions}
            ariaLabel="选择年份"
            onChange={(next) => setDraftYear(Number(next))}
          />
          <Select
            value={String(draftWeek)}
            options={WEEK_OPTIONS}
            ariaLabel="选择周次"
            onChange={(next) => setDraftWeek(Number(next))}
          />
          <button
            type="button"
            className={styles.tagAction}
            onClick={() => {
              setTagging(false);
              onUpdate(memo, { year: draftYear, week: draftWeek });
            }}
          >
            保存
          </button>
          <button
            type="button"
            className={styles.tagAction}
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
const MemoList = ({ memos, loading, onUpdate, onDelete, emptyHint, emptyAction }: MemoListProps) => {
  /** 当前展开菜单的备忘 ID，null 表示全部收起 */
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);

  /** 年份可选项：从起点年份到当前年份 */
  const yearOptions = useMemo<SelectOption[]>(() => {
    const endYear = Math.max(getCurrentWeek().year, START_YEAR);
    const options: SelectOption[] = [];
    for (let year = START_YEAR; year <= endYear; year += 1) {
      options.push({ value: String(year), label: `${year} 年` });
    }
    return options;
  }, []);

  /** 按创建日期分组，新日期在前；组内置顶优先、创建先后 */
  const groups = useMemo<DateGroup[]>(() => {
    const sorted = [...memos].sort((a, b) => {
      const byDate = dayjs(b.createdAt).startOf('day').valueOf() - dayjs(a.createdAt).startOf('day').valueOf();
      if (byDate !== 0) return byDate;
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return a.id - b.id;
    });

    const map = new Map<string, Memo[]>();
    for (const memo of sorted) {
      const key = dayjs(memo.createdAt).format('YYYY-MM-DD');
      const bucket = map.get(key);
      if (bucket === undefined) {
        map.set(key, [memo]);
      } else {
        bucket.push(memo);
      }
    }

    return [...map.entries()].map(([key, list]) => ({
      key,
      label: groupTitle(key),
      memos: list,
    }));
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
      {groups.map((group) => (
        <section key={group.key} className={styles.group}>
          <h3 className={styles.groupTitle}>
            {group.label}
            <span className={styles.groupCount}>（{group.memos.length}）</span>
          </h3>
          <ul>
            {group.memos.map((memo) => (
              <MemoItem
                key={memo.id}
                memo={memo}
                onUpdate={onUpdate}
                onDelete={onDelete}
                yearOptions={yearOptions}
                menuOpen={openMenuId === memo.id}
                onToggleMenu={() =>
                  setOpenMenuId(openMenuId === memo.id ? null : memo.id)
                }
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
};

export default MemoList;
