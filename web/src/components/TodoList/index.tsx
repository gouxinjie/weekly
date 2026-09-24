/**
 * @component 待办清单
 * @description 外层按「所属周」分组（新周在前），组内按状态分三段：置顶 / 未完成 / 已完成，
 * 已完成段默认折叠、标题可点开（M-02）；同一周分组的同一状态段内支持拖拽调整顺序（M-05）；
 * 条目支持勾选、就地编辑、删除、置顶、周次标记与分类标签（产品 / 开发 / 测试 / 文档 / 生活）
 * @author gouxinjie
 * @created 2026-09-18
 * @updated 2026-09-22
 * @remarks PRD 4.2 的 M-02 写「三段分组」，5.6 写「按所属周分组」，两处口径冲突。
 *          这里取两者的并集：外层仍是按周分组（与筛选、周报右栏同一口径），
 *          组内再按状态分三段，已完成默认折叠——两边的要求都不丢。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import Select from '@/components/Select';
import type { SelectOption } from '@/components/Select';
import { START_YEAR, TODO_CATEGORIES } from '@/constants';
import {
  getCurrentWeek,
  getTodoWeek,
  getWeekCount,
  getWeekOfDate,
  isPastWeek,
} from '@/utils/week';
import { todoGroupKey, todoSegment } from '@/utils/todoGroup';
import type { TodoSegment } from '@/utils/todoGroup';
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
  /** 置顶段条目 */
  pinnedItems: Todo[];
  /** 未完成段条目 */
  undoneItems: Todo[];
  /** 已完成段条目 */
  doneItems: Todo[];
  /** 该组总条数，用于组标题计数 */
  total: number;
}

/** 拖拽排序绑定：清单持有拖拽状态，条目只负责把它挂到 DOM 上 */
interface TodoDragBinding {
  /** 本条是否正在被拖动 */
  dragging: boolean;
  /** 本条是否是当前放置目标 */
  dropTarget: boolean;
  /** 开始拖动本条 */
  onDragStart: (event: DragEvent<HTMLLIElement>) => void;
  /** 拖到本条上方 */
  onDragOver: (event: DragEvent<HTMLLIElement>) => void;
  /** 拖离本条（移到行外时才触发，行内子元素之间不触发） */
  onDragLeave: (event: DragEvent<HTMLLIElement>) => void;
  /** 在本条上放下 */
  onDrop: (event: DragEvent<HTMLLIElement>) => void;
  /** 拖动结束（成功或取消） */
  onDragEnd: () => void;
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
  /**
   * 同一分组内拖拽后的新顺序
   * @param draggedId - 被拖动的待办 ID
   * @param targetId - 放置目标的待办 ID，落点固定是它之前
   * @param groupKey - 所属周分组键
   * @param segment - 所属状态段
   * @remarks 只上报「谁放到谁之前」，新顺序由页面按完整列表算出：
   *          搜索状态下清单里只是一部分条目，拿可见的这几条去重排会让被隐藏的条目顺序错乱。
   */
  onReorder: (
    draggedId: number,
    targetId: number,
    groupKey: string,
    segment: TodoSegment,
  ) => void;
  /** 空态文案 */
  emptyHint: string;
  /** 空态附带的动作，可选 */
  emptyAction?: EmptyAction;
  /** 是否默认展开「已完成」段，默认 false；筛选为「已完成」时应传 true，否则整屏折叠、看不到内容 */
  expandDone?: boolean;
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
  /** 拖拽排序绑定（M-05） */
  drag: TodoDragBinding;
  /**
   * 在同段内上移一位；已是该段第一条时传 undefined（菜单项置灰）
   * @remarks 触摸设备上 HTML5 拖拽不生效（iOS Safari 不会触发 dragstart），
   *          菜单里的上移 / 下移是移动端唯一的排序入口，桌面端也可以用它做精确调整
   */
  onMoveUp?: () => void;
  /** 在同段内下移一位；已是该段最后一条时传 undefined（菜单项置灰） */
  onMoveDown?: () => void;
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

/** 周次可选项：按该年实际周数生成（2025 年 52 周、2026 年 53 周），不固定铺 1-53 */
const buildWeekOptions = (year: number): SelectOption[] =>
  Array.from({ length: getWeekCount(year) }, (_, index) => ({
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
const TodoItem = ({
  todo,
  onUpdate,
  onDelete,
  yearOptions,
  menuOpen,
  onToggleMenu,
  drag,
  onMoveUp,
  onMoveDown,
}: TodoItemProps) => {
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

  /** 周次可选项：跟着上面选中的年份走，该年没有第 53 周时就不会出现这一项 */
  const weekOptions = useMemo(() => buildWeekOptions(draftYear), [draftYear]);

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

  /** 编辑中与改标记中禁止拖动：前者要选文本、后者要点下拉，拖动都会互相打断 */
  const canDrag = !editing && !tagging;

  /** 条目类名：叠加「拖动中 / 放置目标」两个修饰类 */
  const itemClass = [
    styles.item,
    drag.dragging ? styles.itemDragging : '',
    drag.dropTarget ? styles.itemDropTarget : '',
  ]
    .filter((name) => name !== '')
    .join(' ');

  return (
    <li
      className={itemClass}
      draggable={canDrag}
      onDragStart={drag.onDragStart}
      onDragOver={drag.onDragOver}
      onDragLeave={drag.onDragLeave}
      onDrop={drag.onDrop}
      onDragEnd={drag.onDragEnd}
    >
      <div className={editing ? `${styles.main} ${styles.mainEditing}` : styles.main}>
        {/* 拖拽手柄：整行本身可拖，这里只是「这一行能拖」的视觉提示 */}
        <span className={styles.dragHandle} title="按住拖动可调整同组内顺序" aria-hidden>
          <svg viewBox="0 0 16 16" fill="currentColor">
            <circle cx="6" cy="4" r="1.1" />
            <circle cx="10" cy="4" r="1.1" />
            <circle cx="6" cy="8" r="1.1" />
            <circle cx="10" cy="8" r="1.1" />
            <circle cx="6" cy="12" r="1.1" />
            <circle cx="10" cy="12" r="1.1" />
          </svg>
        </span>

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
                {/*
                  上移 / 下移：触摸设备上整行拖拽不生效（HTML5 拖拽在 iOS Safari 不触发），
                  这两项是移动端唯一的排序入口；已到该段两端时置灰。
                */}
                <button
                  type="button"
                  className={styles.menuItem}
                  disabled={onMoveUp === undefined}
                  onClick={() => runMenuAction(() => onMoveUp?.())}
                >
                  上移
                </button>
                <button
                  type="button"
                  className={styles.menuItem}
                  disabled={onMoveDown === undefined}
                  onClick={() => runMenuAction(() => onMoveDown?.())}
                >
                  下移
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
            onChange={(next) => {
              const nextYear = Number(next);
              setDraftYear(nextYear);
              // 切换年份时把周次夹到该年实际范围内：2025 年没有第 53 周，
              // 否则下拉会显示成空白，直接保存还会被服务端按越界打回
              setDraftWeek((prev) => Math.min(prev, getWeekCount(nextYear)));
            }}
          />
          <Select
            value={String(draftWeek)}
            options={weekOptions}
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
const TodoList = ({
  todos,
  loading,
  onUpdate,
  onDelete,
  onReorder,
  emptyHint,
  emptyAction,
  expandDone = false,
}: TodoListProps) => {
  /** 当前展开菜单的待办 ID，null 表示全部收起 */
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  /** 已展开「已完成」段的分组键；不在集合里即折叠（M-02 要求默认折叠） */
  const [expandedDoneKeys, setExpandedDoneKeys] = useState<Set<string>>(new Set());
  /** 正在被拖动的条目及其所属分组 / 状态段（M-05） */
  const [dragState, setDragState] = useState<{
    /** 被拖动的待办 ID */
    id: number;
    /** 所属周分组键 */
    groupKey: string;
    /** 所属状态段 */
    segment: TodoSegment;
  } | null>(null);
  /** 当前悬停到的放置目标条目 ID */
  const [overId, setOverId] = useState<number | null>(null);

  /** 年份可选项：从起点年份到当前年份 */
  const yearOptions = useMemo<SelectOption[]>(() => {
    const endYear = Math.max(getCurrentWeek().year, START_YEAR);
    const options: SelectOption[] = [];
    for (let year = START_YEAR; year <= endYear; year += 1) {
      options.push({ value: String(year), label: `${year} 年` });
    }
    return options;
  }, []);

  /**
   * 按所属周分组、组内按状态分段
   * @remarks 段内顺序 = 入参顺序：服务端已按「置顶优先、手动排序、创建先后」返回，
   *          前端不再重排，拖拽调整后的顺序才能原样呈现。
   */
  const groups = useMemo<WeekGroup[]>(() => {
    const current = getCurrentWeek();
    const buckets = new Map<string, WeekGroup>();

    for (const todo of todos) {
      const { year, week } = getTodoWeek(todo);
      const key = todoGroupKey(todo);
      const bucket = buckets.get(key) ?? {
        key,
        label: groupTitle(year, week, current),
        pinnedItems: [],
        undoneItems: [],
        doneItems: [],
        total: 0,
      };
      buckets.set(key, bucket);

      bucket.total += 1;
      const segment = todoSegment(todo);
      if (segment === 'pinned') bucket.pinnedItems.push(todo);
      else if (segment === 'undone') bucket.undoneItems.push(todo);
      else bucket.doneItems.push(todo);
    }

    // 周次新的在前：分组键形如「年-周」，按年、周倒序重排
    return [...buckets.values()].sort((a, b) => {
      const [yearA, weekA] = a.key.split('-').map(Number);
      const [yearB, weekB] = b.key.split('-').map(Number);
      if (yearA !== yearB) return yearB - yearA;
      return weekB - weekA;
    });
  }, [todos]);

  /*
   * 筛选为「已完成」时默认全部展开：那种筛选下整屏都是已完成段，
   * 若仍默认折叠就等于看不到任何内容。
   * 只对「首次出现的分组」自动展开——否则用户手动折叠某组后，
   * 任何一次增删改都会让 groups 变化，把折叠好的分组又强行展开。
   */
  const autoExpandedKeys = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!expandDone) return;
    setExpandedDoneKeys((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const group of groups) {
        if (autoExpandedKeys.current.has(group.key)) continue;
        autoExpandedKeys.current.add(group.key);
        if (!next.has(group.key)) {
          next.add(group.key);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [expandDone, groups]);

  /** 清空所有拖拽态 */
  const resetDrag = useCallback((): void => {
    setDragState(null);
    setOverId(null);
  }, []);

  /**
   * 开始拖动某条待办
   * @param groupKey - 所属周分组键
   * @param segment - 所属状态段
   * @param todo - 被拖动的待办
   * @param event - 拖拽事件，用于写入 dataTransfer
   * @returns 无
   */
  const handleDragStart = useCallback(
    (
      groupKey: string,
      segment: TodoSegment,
      todo: Todo,
      event: DragEvent<HTMLLIElement>,
    ): void => {
      // Firefox 必须写入 dataTransfer 才会真正进入拖拽
      event.dataTransfer.setData('text/plain', String(todo.id));
      event.dataTransfer.effectAllowed = 'move';
      setDragState({ id: todo.id, groupKey, segment });
      setOverId(null);
    },
    [],
  );

  /**
   * 拖到某条待办上方
   * @param groupKey - 目标所属周分组键
   * @param segment - 目标所属状态段
   * @param todo - 目标待办
   * @param event - 拖拽事件
   * @returns 无
   * @remarks 只接受「同一周分组的同一状态段」：跨段拖会与勾选分组语义打架。
   *          落到不可放置的条目上时要顺手清掉插入线，否则它会停在上一处目标行上不消失。
   */
  const handleDragOver = useCallback(
    (
      groupKey: string,
      segment: TodoSegment,
      todo: Todo,
      event: DragEvent<HTMLLIElement>,
    ): void => {
      if (dragState === null) return;
      if (
        dragState.groupKey !== groupKey ||
        dragState.segment !== segment ||
        dragState.id === todo.id
      ) {
        setOverId(null);
        return;
      }

      // 必须 preventDefault，否则浏览器不认这是一个可放置目标
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setOverId(todo.id);
    },
    [dragState],
  );

  /**
   * 拖离某条待办
   * @param event - 拖拽事件，用于判断是移到行外还是行内子元素之间
   * @returns 无
   * @remarks dragleave 在子元素之间移动时也会触发，用 relatedTarget 过滤掉，
   *          否则插入线会在行内划过时不停闪烁。
   */
  const handleDragLeave = useCallback((event: DragEvent<HTMLLIElement>): void => {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    setOverId(null);
  }, []);

  /**
   * 在某条待办上放下
   * @param groupKey - 目标所属周分组键
   * @param segment - 目标所属状态段
   * @param todo - 目标待办
   * @param event - 拖拽事件
   * @returns 无
   * @remarks 只上报「把哪一条放到哪一条之前」，新顺序交给页面按完整列表计算：
   *          搜索状态下清单里只是一部分条目，拿可见的这几条去排会让被隐藏的条目顺序错乱。
   */
  const handleDrop = useCallback(
    (
      groupKey: string,
      segment: TodoSegment,
      todo: Todo,
      event: DragEvent<HTMLLIElement>,
    ): void => {
      event.preventDefault();
      if (dragState === null) {
        resetDrag();
        return;
      }
      if (dragState.groupKey !== groupKey || dragState.segment !== segment) {
        resetDrag();
        return;
      }

      const draggedId = dragState.id;
      resetDrag();
      if (draggedId === todo.id) return;
      onReorder(draggedId, todo.id, groupKey, segment);
    },
    [dragState, onReorder, resetDrag],
  );

  /**
   * 组装传给 TodoItem 的拖拽绑定
   * @param groupKey - 所属周分组键
   * @param segment - 所属状态段
   * @param todo - 目标待办
   * @returns 拖拽绑定
   */
  const buildDrag = (
    groupKey: string,
    segment: TodoSegment,
    todo: Todo,
  ): TodoDragBinding => ({
    dragging: dragState !== null && dragState.id === todo.id,
    dropTarget: overId === todo.id,
    onDragStart: (event) => handleDragStart(groupKey, segment, todo, event),
    onDragOver: (event) => handleDragOver(groupKey, segment, todo, event),
    onDragLeave: handleDragLeave,
    onDrop: (event) => handleDrop(groupKey, segment, todo, event),
    onDragEnd: resetDrag,
  });

  /**
   * 取某条待办在同段内的上下邻居
   * @param group - 所属周分组
   * @param segment - 所属状态段
   * @param id - 目标待办 ID
   * @returns 上一条与下一条；位于该段两端时为 undefined
   */
  const segmentNeighbors = (
    group: WeekGroup,
    segment: TodoSegment,
    id: number,
  ): { prev: Todo | undefined; next: Todo | undefined } => {
    const items =
      segment === 'pinned'
        ? group.pinnedItems
        : segment === 'done'
          ? group.doneItems
          : group.undoneItems;

    const index = items.findIndex((item) => item.id === id);
    return {
      prev: index > 0 ? items[index - 1] : undefined,
      next: index >= 0 && index < items.length - 1 ? items[index + 1] : undefined,
    };
  };

  /**
   * 渲染单条待办
   * @param group - 所属周分组
   * @param segment - 所属状态段
   * @param todo - 待办
   * @returns 条目节点
   * @remarks 上移 / 下移都翻译成已有的「移到某条之前」：下移一位等价于「把下一条移到本条之前」，
   *          两者是同一个相邻交换，因此不必为「移到最后」再开一条接口。
   */
  const renderItem = (group: WeekGroup, segment: TodoSegment, todo: Todo) => {
    const { prev, next } = segmentNeighbors(group, segment, todo.id);

    return (
      <TodoItem
        key={todo.id}
        todo={todo}
        onUpdate={onUpdate}
        onDelete={onDelete}
        yearOptions={yearOptions}
        menuOpen={openMenuId === todo.id}
        onToggleMenu={() => setOpenMenuId(openMenuId === todo.id ? null : todo.id)}
        drag={buildDrag(group.key, segment, todo)}
        onMoveUp={
          prev === undefined ? undefined : () => onReorder(todo.id, prev.id, group.key, segment)
        }
        onMoveDown={
          next === undefined ? undefined : () => onReorder(next.id, todo.id, group.key, segment)
        }
      />
    );
  };

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
      {groups.map((group) => {
        const doneExpanded = expandedDoneKeys.has(group.key);
        return (
          <section key={group.key} className={styles.group}>
            <h3 className={styles.groupTitle}>
              {group.label}
              <span className={styles.groupCount}>（{group.total}）</span>
            </h3>

            {/* 置顶段：置顶且未完成；该段为空时整段不出现，不占一行说明 */}
            {group.pinnedItems.length > 0 ? (
              <>
                <p className={styles.segmentTitle}>置顶</p>
                <ul>{group.pinnedItems.map((todo) => renderItem(group, 'pinned', todo))}</ul>
              </>
            ) : null}

            {/* 未完成段：清单主体，不加段标题，避免每个分组都挂一行说明 */}
            {group.undoneItems.length > 0 ? (
              <ul>{group.undoneItems.map((todo) => renderItem(group, 'undone', todo))}</ul>
            ) : null}

            {/* 已完成段：永久保留，默认折叠，标题可点开（M-02 / Q4） */}
            {group.doneItems.length > 0 ? (
              <>
                <button
                  type="button"
                  className={styles.doneToggle}
                  aria-expanded={doneExpanded}
                  onClick={() =>
                    setExpandedDoneKeys((prev) => {
                      const next = new Set(prev);
                      if (next.has(group.key)) {
                        next.delete(group.key);
                      } else {
                        next.add(group.key);
                      }
                      return next;
                    })
                  }
                >
                  <svg
                    className={doneExpanded ? styles.doneCaretOpen : styles.doneCaret}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="m9 6 6 6-6 6" />
                  </svg>
                  已完成（{group.doneItems.length}）
                </button>

                {doneExpanded ? (
                  <ul>{group.doneItems.map((todo) => renderItem(group, 'done', todo))}</ul>
                ) : null}
              </>
            ) : null}
          </section>
        );
      })}
    </div>
  );
};

export default TodoList;
