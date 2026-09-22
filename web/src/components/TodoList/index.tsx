/**
 * @component 待办清单
 * @description 按「所属周」分组（手动标记的周优先，未标记时按创建时间推导）的待办清单，
 * 支持勾选、就地编辑、删除、置顶、周次标记与分类标签（产品 / 开发 / 测试 / 文档 / 生活）
 * @author gouxinjie
 * @created 2026-09-18
 * @updated 2026-09-22
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import Select from '@/components/Select';
import type { SelectOption } from '@/components/Select';
import { MAX_WEEK, TODO_CATEGORIES, START_YEAR } from '@/constants';
import { getCurrentWeek, getTodoWeek, getWeekOfDate, isPastWeek } from '@/utils/week';
import type { UpdateTodoBody } from '@/types/api';
import type { Todo, WeekRef } from '@/types/models';
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
  /** 该组待办 */
  todos: Todo[];
}

/** TodoList 属性 */
interface TodoListProps {
  /** 已按筛选条件过滤后的待办 */
  todos: Todo[];
  /** 是否正在加载 */
  loading: boolean;
  /** 局部更新某条待办 */
  onUpdate: (todo: Todo, patch: Partial<UpdateTodoBody>) => void;
  /** 删除某条待办 */
  onDelete: (todo: Todo) => void;
  /** 空态文案 */
  emptyHint: string;
  /** 空态附带的动作，可选 */
  emptyAction?: EmptyAction;
}

/** TodoItem 属性 */
interface TodoItemProps {
  /** 待办条目 */
  todo: Todo;
  /** 局部更新回调 */
  onUpdate: (todo: Todo, patch: Partial<UpdateTodoBody>) => void;
  /** 删除回调 */
  onDelete: (todo: Todo) => void;
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
  TODO_CATEGORIES.map((item) => [item.value, item.label]),
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
 * 单条待办
 * @param props - 见 TodoItemProps
 * @returns 条目节点
 */
const TodoItem = ({ todo, onUpdate, onDelete, yearOptions, menuOpen, onToggleMenu }: TodoItemProps) => {
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState(todo.text);
  const [tagging, setTagging] = useState(false);
  const [draftYear, setDraftYear] = useState(todo.year ?? getCurrentWeek().year);
  const [draftWeek, setDraftWeek] = useState(todo.week ?? getCurrentWeek().week);
  const [error, setError] = useState('');
  /** 文本是否超出展示行数被截断，决定要不要出现「展开全部」 */
  const [overflowing, setOverflowing] = useState(false);
  /** 长待办是否已展开全部行 */
  const [expanded, setExpanded] = useState(false);

  /** 就地编辑框引用：用于按内容自撑高度，长待办不会被压在一行里 */
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  /** 展示态文本引用：用于量出文本是否被行数限制截断 */
  const textRef = useRef<HTMLButtonElement | null>(null);

  const tagged = todo.year !== null && todo.week !== null;

  /*
   * 过期：标记周次已过且未完成。只挂一枚危险色小提示，不动整行底色——
   * 整行底色曾是 --color-bg-active，那是全站「选中态」用的颜色，
   * 结果每一条补写往期周的待办看起来都像被选中/被高亮，反而更吵。
   * 仅视觉提示，不改变分组、不推提醒。
   */
  const overdue = !todo.done && tagged && isPastWeek(todo.year as number, todo.week as number);

  /** 未标记时按创建时间推导出的记录周次，仅用于「未标记」提示的说明文案 */
  const recordedWeek = useMemo(
    () => (tagged ? null : getWeekOfDate(todo.createdAt)),
    [tagged, todo.createdAt],
  );

  /** 提交文本编辑 */
  const commitText = (): void => {
    const next = draftText.trim();
    if (next === '') {
      setError('待办内容不能为空');
      setDraftText(todo.text);
      setEditing(false);
      return;
    }
    setError('');
    setEditing(false);
    if (next !== todo.text) {
      onUpdate(todo, { text: next });
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
  }, [expanded, editing, todo.text]);

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
  const textClass = [todo.done ? styles.textDone : styles.text, ...(expanded ? [styles.textExpanded] : [])].join(' ');

  return (
    <li className={styles.item}>
      <div className={editing ? `${styles.main} ${styles.mainEditing}` : styles.main}>
        <input
          type="checkbox"
          className={styles.checkbox}
          checked={todo.done}
          onChange={() => onUpdate(todo, { done: !todo.done })}
          aria-label={todo.done ? '标记为未完成' : '标记为已完成'}
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
              // 待办是单行条目：回车直接提交，不写入换行
              if (event.key === 'Enter') {
                event.preventDefault();
                commitText();
              }
              if (event.key === 'Escape') {
                setDraftText(todo.text);
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
              setDraftText(todo.text);
              setEditing(true);
            }}
            title="点击编辑"
          >
            {todo.text}
          </button>
        )}

        <div className={styles.meta}>
          {/* 置顶标记：与分类标签同处右侧标签区，不做悬在行外的角标 */}
          {todo.pinned ? <span className={styles.pinMark}>置顶</span> : null}

          {/* 分类标签：彩色胶囊 */}
          {todo.category !== '' ? (
            <span className={`${styles.category} ${CATEGORY_CLASS[todo.category] ?? ''}`}>
              {CATEGORY_LABEL[todo.category] ?? todo.category}
            </span>
          ) : null}

          {/*
            未标记：所属周由创建时间推导，周次已由分组标题表达，这里只提示「它不是手动标记的」——
            这才是真正看不出来的差别：未标记的条目不会进周报右栏的「本周待办」。
          */}
          {recordedWeek !== null ? (
            <span
              className={styles.unmarkedTag}
              title={`未标记到任何周，不计入周报「本周待办」；按创建时间属于 ${recordedWeek.year} 年第 ${recordedWeek.week} 周`}
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
                  onClick={() => runMenuAction(() => onUpdate(todo, { pinned: !todo.pinned }))}
                >
                  {todo.pinned ? '取消置顶' : '置顶'}
                </button>
                <div className={styles.menuCategories}>
                  {TODO_CATEGORIES.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={
                        todo.category === option.value
                          ? styles.menuCatActive
                          : styles.menuCat
                      }
                      onClick={() => runMenuAction(() => onUpdate(todo, { category: option.value }))}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className={`${styles.menuItem} ${styles.menuItemDanger}`}
                  onClick={() => runMenuAction(() => onDelete(todo))}
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
              onUpdate(todo, { year: draftYear, week: draftWeek });
            }}
          >
            保存
          </button>
          <button
            type="button"
            className={styles.tagAction}
            onClick={() => {
              setTagging(false);
              onUpdate(todo, { year: null, week: null });
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
 * 待办清单
 * @param props - 见 TodoListProps
 * @returns 分组清单节点
 */
const TodoList = ({ todos, loading, onUpdate, onDelete, emptyHint, emptyAction }: TodoListProps) => {
  /** 当前展开菜单的待办 ID，null 表示全部收起 */
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

    const sorted = [...todos].sort((a, b) => {
      const weekA = getTodoWeek(a);
      const weekB = getTodoWeek(b);
      if (weekA.year !== weekB.year) return weekB.year - weekA.year;
      if (weekA.week !== weekB.week) return weekB.week - weekA.week;
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return a.id - b.id;
    });

    // Map 保持插入顺序，因此分组的先后就是上面排好的周次先后
    const map = new Map<string, WeekGroup>();
    for (const todo of sorted) {
      const { year, week } = getTodoWeek(todo);
      const key = `${year}-${week}`;
      const bucket = map.get(key);
      if (bucket === undefined) {
        map.set(key, { key, label: groupTitle(year, week, current), todos: [todo] });
      } else {
        bucket.todos.push(todo);
      }
    }

    return [...map.values()];
  }, [todos]);

  if (loading) {
    // 套用空态容器，让加载提示与清单保持同一段左内边距
    return (
      <div className={styles.empty}>
        <p className={styles.hint}>加载中…</p>
      </div>
    );
  }

  if (todos.length === 0) {
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
            <span className={styles.groupCount}>（{group.todos.length}）</span>
          </h3>
          <ul>
            {group.todos.map((todo) => (
              <TodoItem
                key={todo.id}
                todo={todo}
                onUpdate={onUpdate}
                onDelete={onDelete}
                yearOptions={yearOptions}
                menuOpen={openMenuId === todo.id}
                onToggleMenu={() =>
                  setOpenMenuId(openMenuId === todo.id ? null : todo.id)
                }
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
};

export default TodoList;
