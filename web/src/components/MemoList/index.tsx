/**
 * @component 备忘清单
 * @description 按「所属周」分组（手动标记的周优先，未标记时按创建时间推导）的待办清单，
 * 支持勾选、就地编辑、删除、置顶、周次标记与分类标签（产品 / 开发 / 测试 / 文档 / 生活）
 * @author gouxinjie
 * @created 2026-09-18
 * @updated 2026-09-22
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import Select from '@/components/Select';
import type { SelectOption } from '@/components/Select';
import { MAX_WEEK, MEMO_CATEGORIES, START_YEAR } from '@/constants';
import { getCurrentWeek, getMemoWeek, getWeekOfDate, isPastWeek } from '@/utils/week';
import type { UpdateMemoBody } from '@/types/api';
import type { Memo, WeekRef } from '@/types/models';
import styles from './index.module.scss';

/** 空态动作 */
interface EmptyAction {
  /** 动作文案 */
  label: string;
  /** 点击回调 */
  onClick: () => void;
}

/** 周分组 */
interface WeekGroup {
  /** 分组键：`年-周`，如 2026-39 */
  key: string;
  /** 组标题 */
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
 * 生成周分组的标题
 * @param year - 该组所属 ISO 年
 * @param week - 该组所属 ISO 周次
 * @param current - 当前 ISO 周，用于把当周标成「本周」
 * @returns 当前周为「本周 · 第 39 周」，其余为「第 38 周 · 26」
 */
const groupTitle = (year: number, week: number, current: WeekRef): string =>
  year === current.year && week === current.week
    ? `本周 · 第 ${week} 周`
    : `第 ${week} 周 · ${String(year).slice(-2)}`;

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
  /** 文本是否超出展示行数被截断，决定要不要出现「展开全部」 */
  const [overflowing, setOverflowing] = useState(false);
  /** 长待办是否已展开全部行 */
  const [expanded, setExpanded] = useState(false);

  /** 就地编辑框引用：用于按内容自撑高度，长待办不会被压在一行里 */
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  /** 展示态文本引用：用于量出文本是否被行数限制截断 */
  const textRef = useRef<HTMLButtonElement | null>(null);

  const tagged = memo.year !== null && memo.week !== null;

  /*
   * 过期：标记周次已过且未完成。只挂一枚危险色小提示，不动整行底色——
   * 整行底色曾是 --color-bg-active，那是全站「选中态」用的颜色，
   * 结果每一条补写往期周的备忘看起来都像被选中/被高亮，反而更吵。
   * 仅视觉提示，不改变分组、不推提醒。
   */
  const overdue = !memo.done && tagged && isPastWeek(memo.year as number, memo.week as number);

  /** 未标记时按创建时间推导出的记录周次，仅用于「未标记」提示的说明文案 */
  const recordedWeek = useMemo(
    () => (tagged ? null : getWeekOfDate(memo.createdAt)),
    [tagged, memo.createdAt],
  );

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

  /*
   * 编辑框高度跟随内容：先把高度复位为 auto 再按 scrollHeight 撑开，
   * 否则删除文字时高度只增不减。超高时由 .textInput 的 max-height 兜底，转为框内滚动。
   */
  useEffect(() => {
    const node = textAreaRef.current;
    if (!editing || node === null) return;
    node.style.height = 'auto';
    node.style.height = `${node.scrollHeight}px`;
  }, [editing, draftText]);

  /*
   * 判定文本是否被行数限制截断。
   * line-clamp 生效时超出部分会被直接截掉、scrollHeight 不一定可信，因此临时挂上展开类量一次
   * 完整高度再当场摘掉（同一帧内完成，不会闪）。展开态与编辑态无需判定，沿用收起时的结果，
   * 否则「收起」入口会在展开后消失。
   * 窗口尺寸变化会改变可用宽度、进而改变折行数，所以 resize 也要重量一次，
   * 否则「展开全部」会一直停在旧判定上（该出现时没有、该消失时还在）。
   */
  useEffect(() => {
    const node = textRef.current;
    if (node === null || expanded || editing) return undefined;

    const measure = (): void => {
      node.classList.add(styles.textExpanded);
      const fullHeight = node.scrollHeight;
      node.classList.remove(styles.textExpanded);
      setOverflowing(fullHeight > node.clientHeight + 1);
    };

    measure();
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
    };
  }, [expanded, editing, memo.text]);

  /**
   * 菜单项公共行为：先收起菜单再执行动作
   * @param action - 菜单动作
   * @returns 无
   */
  const runMenuAction = (action: () => void): void => {
    onToggleMenu();
    action();
  };

  /** 展示态文本类名：完成态置灰，展开态解除行数限制 */
  const textClass = [memo.done ? styles.textDone : styles.text, ...(expanded ? [styles.textExpanded] : [])].join(' ');

  return (
    <li className={styles.item}>
      <div className={editing ? `${styles.main} ${styles.mainEditing}` : styles.main}>
        <input
          type="checkbox"
          className={styles.checkbox}
          checked={memo.done}
          onChange={() => onUpdate(memo, { done: !memo.done })}
          aria-label={memo.done ? '标记为未完成' : '标记为已完成'}
        />

        {editing ? (
          <textarea
            ref={textAreaRef}
            className={styles.textInput}
            value={draftText}
            autoFocus
            rows={1}
            maxLength={500}
            aria-label="编辑待办内容"
            onChange={(event) => setDraftText(event.target.value)}
            onBlur={commitText}
            onKeyDown={(event) => {
              // 备忘是单行条目：回车直接提交，不写入换行
              if (event.key === 'Enter') {
                event.preventDefault();
                commitText();
              }
              if (event.key === 'Escape') {
                setDraftText(memo.text);
                setEditing(false);
              }
            }}
          />
        ) : (
          <button
            ref={textRef}
            type="button"
            className={textClass}
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
          {/* 置顶标记：与分类标签同处右侧标签区，不做悬在行外的角标 */}
          {memo.pinned ? <span className={styles.pinMark}>置顶</span> : null}

          {/* 分类标签：彩色胶囊 */}
          {memo.category !== '' ? (
            <span className={`${styles.category} ${CATEGORY_CLASS[memo.category] ?? ''}`}>
              {CATEGORY_LABEL[memo.category] ?? memo.category}
            </span>
          ) : null}

          {/*
            未标记：所属周由创建时间推导，周次已由分组标题表达，这里只提示「它不是手动标记的」——
            这才是真正看不出来的差别：未标记的条目不会进周报右栏的「本周参考」。
          */}
          {recordedWeek !== null ? (
            <span
              className={styles.unmarkedTag}
              title={`未标记到任何周，不计入周报「本周参考」；按创建时间属于 ${recordedWeek.year} 年第 ${recordedWeek.week} 周`}
            >
              未标记
            </span>
          ) : null}

          {/* 过期：标记的周已过且这条未完成，仅视觉提示 */}
          {overdue ? (
            <span className={styles.overdueTag} title="标记的周已过，这条还没完成">
              过期
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

      {/* 长待办默认只展示 3 行，被截断时给出展开入口 */}
      {overflowing ? (
        <button
          type="button"
          className={styles.expandToggle}
          aria-expanded={expanded}
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded ? '收起' : '展开全部'}
        </button>
      ) : null}

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

  /** 按所属周分组，周次新的在前；组内置顶优先、创建先后 */
  const groups = useMemo<WeekGroup[]>(() => {
    const current = getCurrentWeek();

    const sorted = [...memos].sort((a, b) => {
      const weekA = getMemoWeek(a);
      const weekB = getMemoWeek(b);
      if (weekA.year !== weekB.year) return weekB.year - weekA.year;
      if (weekA.week !== weekB.week) return weekB.week - weekA.week;
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return a.id - b.id;
    });

    // Map 保持插入顺序，因此分组的先后就是上面排好的周次先后
    const map = new Map<string, WeekGroup>();
    for (const memo of sorted) {
      const { year, week } = getMemoWeek(memo);
      const key = `${year}-${week}`;
      const bucket = map.get(key);
      if (bucket === undefined) {
        map.set(key, { key, label: groupTitle(year, week, current), memos: [memo] });
      } else {
        bucket.memos.push(memo);
      }
    }

    return [...map.values()];
  }, [memos]);

  if (loading) {
    // 套用空态容器，让加载提示与清单保持同一段左内边距
    return (
      <div className={styles.empty}>
        <p className={styles.hint}>加载中…</p>
      </div>
    );
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
