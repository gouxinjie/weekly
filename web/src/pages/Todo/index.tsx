/**
 * @component 工作台（待办）
 * @description 三栏骨架：左栏页签、左列筛选（占据周报态时间轴那一列）、
 * 中栏标题 + 常驻新建输入框 + 「按周分组、组内分置顶 / 未完成 / 已完成」的清单；
 * 此态下右栏整栏移除；增删改后刷新页签的未完成计数角标（M-09）
 * @author gouxinjie
 * @created 2026-09-18
 * @updated 2026-09-22
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toErrorMessage } from '@/api/client';
import { createTodo, deleteTodo, fetchTodos, reorderTodos, updateTodo } from '@/api/todo';
import AppLayout from '@/components/AppLayout';
import TodoFilter from '@/components/TodoFilter';
import TodoList from '@/components/TodoList';
import Select from '@/components/Select';
import { TODO_CATEGORIES } from '@/constants';
import { useTodoCount } from '@/contexts/TodoCountContext';
import { getCurrentWeek, getTodoWeek, isValidWeek } from '@/utils/week';
import { todoGroupKey, todoSegment } from '@/utils/todoGroup';
import type { TodoSegment } from '@/utils/todoGroup';
import type { UpdateTodoBody } from '@/types/api';
import type { Todo as TodoModel, TodoFilter as TodoFilterValue, WeekRef } from '@/types/models';
import styles from './index.module.scss';

/**
 * 把一批待办按给定顺序填回它们原本占据的槽位
 * @param list - 当前列表
 * @param order - 目标顺序的待办 ID 数组
 * @returns 重排后的新列表；不在 order 里的条目位置保持不动
 * @remarks 乐观更新与失败回滚共用同一套「按槽位填充」逻辑，保证两次变换互为逆操作。
 */
const applyOrder = (list: TodoModel[], order: number[]): TodoModel[] => {
  const rank = new Map(order.map((id, index) => [id, index]));
  const affected = list.filter((item) => rank.has(item.id));
  const sorted = [...affected].sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));

  let cursor = 0;
  return list.map((item) => (rank.has(item.id) ? sorted[cursor++] : item));
};

/**
 * 回退一条待办的乐观更新
 * @param current - 乐观更新后的当前条目
 * @param before - 乐观更新前的条目
 * @param optimistic - 本次乐观写入的完整提交体
 * @returns 回退后的条目
 * @remarks 只回退「值仍等于本次乐观写入值」的字段：
 * 用户在该请求失败前又改过的字段保持不动，不会把新输入一起吞掉。
 */
const rollbackTodo = (
  current: TodoModel,
  before: TodoModel,
  optimistic: UpdateTodoBody,
): TodoModel => {
  const next = { ...current };
  if (next.text === optimistic.text) next.text = before.text;
  if (next.done === optimistic.done) next.done = before.done;
  if (next.pinned === optimistic.pinned) next.pinned = before.pinned;
  if (next.year === optimistic.year) next.year = before.year;
  if (next.week === optimistic.week) next.week = before.week;
  if (next.category === optimistic.category) next.category = before.category;
  return next;
};

/**
 * 工作台（待办）
 * @returns 页面节点
 */
const Todo = () => {
  const { refreshUndoneCount } = useTodoCount();
  const [todos, setTodos] = useState<TodoModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<TodoFilterValue>('all');
  const [keyword, setKeyword] = useState('');
  const [newText, setNewText] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [pending, setPending] = useState(false);

  /** 路由查询参数：承载从周报页「＋ 新建」带过来的目标周次 */
  const [searchParams] = useSearchParams();

  const newInputRef = useRef<HTMLInputElement | null>(null);

  // 首次加载全部待办
  useEffect(() => {
    let active = true;

    void fetchTodos()
      .then((list) => {
        if (active) setTodos(list);
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
   * 从周报页「＋ 新建 / 去待办添加」跳过来时 URL 会带上当时查看的周（?year=&week=），
   * 优先沿用它——翻往期周报时新建的待办该落到那一周，而不是「今天所在的周」；
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
    (todo: TodoModel): boolean => {
      const week = getTodoWeek(todo);
      return week.year === currentWeek.year && week.week === currentWeek.week;
    },
    [currentWeek],
  );

  /** 各筛选结果与计数 */
  const counts = useMemo<Record<TodoFilterValue, number>>(
    () => ({
      all: todos.length,
      week: todos.filter(isCurrentWeek).length,
      undone: todos.filter((todo) => !todo.done).length,
      done: todos.filter((todo) => todo.done).length,
    }),
    [todos, isCurrentWeek],
  );

  /** 先按状态筛选，再按关键词过滤（关键词仅在前端本地过滤，不额外请求接口） */
  const filtered = useMemo(() => {
    const byStatus = ((): TodoModel[] => {
      switch (filter) {
        case 'week':
          return todos.filter(isCurrentWeek);
        case 'undone':
          return todos.filter((todo) => !todo.done);
        case 'done':
          return todos.filter((todo) => todo.done);
        default:
          return todos;
      }
    })();

    const text = keyword.trim().toLowerCase();
    if (text === '') return byStatus;
    return byStatus.filter((todo) => todo.text.toLowerCase().includes(text));
  }, [todos, filter, isCurrentWeek, keyword]);

  /** 新建待办，Enter 触发且保持焦点 */
  const handleCreate = useCallback(async (): Promise<void> => {
    const text = newText.trim();
    if (text === '' || pending) return;

    setPending(true);
    setError('');
    try {
      // 新建的待办默认标记到 defaultWeek（周报页带过来的周，否则当前 ISO 周）：
      // 待办是「按周攒素材」的东西，留空会导致它既不出现在「本周」筛选里，
      // 也进不了周报右栏的「本周待办」。需要归属其它周时，创建后在「⋯」菜单改标记。
      const created = await createTodo({
        text,
        category: newCategory,
        year: defaultWeek.year,
        week: defaultWeek.week,
      });
      setTodos((prev) => [...prev, created]);
      setNewText('');
      newInputRef.current?.focus();
      refreshUndoneCount();
    } catch (err) {
      setError(toErrorMessage(err, '添加失败，请稍后重试'));
    } finally {
      setPending(false);
    }
  }, [newText, newCategory, pending, defaultWeek, refreshUndoneCount]);

  /**
   * 局部更新某条待办（乐观更新，失败按条回滚）
   * @param todo - 目标待办
   * @param patch - 需要变更的字段
   * @returns 无
   * @remarks 回滚只针对这一条，不能用整表快照：并发操作（例如连点两个勾选框）时，
   * 后一次失败会把前一次已经落库成功的改动在界面上一起退回。
   */
  const handleUpdate = useCallback(
    async (todo: TodoModel, patch: Partial<UpdateTodoBody>): Promise<void> => {
      const body: UpdateTodoBody = {
        text: patch.text ?? todo.text,
        done: patch.done ?? todo.done,
        pinned: patch.pinned ?? todo.pinned,
        // year / week 允许显式传 null，因此不能用 ?? 判断
        year: patch.year !== undefined ? patch.year : todo.year,
        week: patch.week !== undefined ? patch.week : todo.week,
        category: patch.category ?? todo.category,
      };

      const before = todos.find((item) => item.id === todo.id);
      setError('');
      setTodos((prev) => prev.map((item) => (item.id === todo.id ? { ...item, ...body } : item)));

      try {
        await updateTodo(todo.id, body);
        // 勾选 / 取消勾选会改变未完成条数，刷新页签角标（M-09）
        refreshUndoneCount();
      } catch (err) {
        if (before !== undefined) {
          setTodos((prev) =>
            prev.map((item) =>
              item.id === todo.id ? rollbackTodo(item, before, body) : item,
            ),
          );
        }
        setError(toErrorMessage(err, '更新失败，请稍后重试'));
      }
    },
    [todos, refreshUndoneCount],
  );

  /**
   * 删除某条待办（乐观更新，失败按条回滚）
   * @param todo - 目标待办
   * @returns 无
   * @remarks 失败时只把这一条插回它原来的下标，理由同 handleUpdate。
   */
  const handleDelete = useCallback(
    async (todo: TodoModel): Promise<void> => {
      const index = todos.findIndex((item) => item.id === todo.id);
      setError('');
      setTodos((prev) => prev.filter((item) => item.id !== todo.id));

      try {
        await deleteTodo(todo.id);
        refreshUndoneCount();
      } catch (err) {
        setTodos((prev) => {
          // 该条已经被重新创建 / 加回来时不再重复插入
          if (prev.some((item) => item.id === todo.id)) return prev;
          const next = [...prev];
          next.splice(index < 0 ? next.length : Math.min(index, next.length), 0, todo);
          return next;
        });
        setError(toErrorMessage(err, '删除失败，请稍后重试'));
      }
    },
    [todos, refreshUndoneCount],
  );

  /**
   * 同组拖拽排序：把 draggedId 移到 targetId 之前，先本地重排再提交（M-05）
   * @param draggedId - 被拖动的待办 ID
   * @param targetId - 放置目标的待办 ID
   * @param groupKey - 所属周分组键
   * @param segment - 所属状态段
   * @returns 无
   * @remarks 两条容易踩的坑：
   *          1. 新顺序从「完整列表」而不是清单传来的可见条目里取——搜索时可见条目只是子集，
   *             只重排子集会让被隐藏的条目顺序错乱（服务端按下标把序号从 1 重写，
   *             没提交的那些条目仍保留旧序号，于是撞车）。
   *          2. 落点固定是「目标之前」，与清单画在目标行顶部的插入线一致：
   *             摘掉被拖动项后，向下拖时目标下标会左移一位，减掉这一位才不会差一格。
   *          本地只把该段的条目按新顺序填回原来的槽位，其余条目位置不动；
   *          服务端按下标重写 sort_order，失败则把该段恢复成拖拽前的顺序。
   */
  const handleReorder = useCallback(
    async (
      draggedId: number,
      targetId: number,
      groupKey: string,
      segment: TodoSegment,
    ): Promise<void> => {
      const ids = todos
        .filter((item) => todoGroupKey(item) === groupKey && todoSegment(item) === segment)
        .map((item) => item.id);
      const from = ids.indexOf(draggedId);
      const to = ids.indexOf(targetId);
      if (from === -1 || to === -1 || from === to) return;

      const next = [...ids];
      next.splice(from, 1);
      next.splice(to - (from < to ? 1 : 0), 0, draggedId);

      setError('');
      setTodos((prev) => applyOrder(prev, next));

      try {
        await reorderTodos(next);
      } catch (err) {
        // 恢复成拖拽前的顺序：只重排这一段，其它条目与并发操作不受影响
        setTodos((prev) => applyOrder(prev, ids));
        setError(toErrorMessage(err, '排序失败，请稍后重试'));
      }
    },
    [todos],
  );

  /** 空态文案与动作：区分「整体为空」「搜索无结果」与「某筛选结果为空」 */
  const emptyHint = useMemo(() => {
    if (todos.length === 0) return '还没有待办，在上面输入一条试试';
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
  }, [todos.length, filter, keyword]);

  const emptyAction = useMemo(() => {
    if (todos.length === 0) {
      return { label: '去输入', onClick: () => newInputRef.current?.focus() };
    }
    if (keyword.trim() !== '') {
      return { label: '清空搜索', onClick: () => setKeyword('') };
    }
    if (filter !== 'all') {
      return { label: '查看全部', onClick: () => setFilter('all') };
    }
    return undefined;
  }, [todos.length, filter, keyword]);

  return (
    <AppLayout
      activeTab="todo"
      // 筛选放在左列：与周报态的时间轴占同一列，切换标签页时列本身不位移
      leftColumn={<TodoFilter value={filter} counts={counts} onChange={setFilter} />}
    >
      {/* 标题行：待办 + 搜索框 + 新建按钮 */}
      <header className={styles.header}>
        <h1 className={styles.title}>待办</h1>

        <div className={styles.headerRight}>
          {/* 搜索框：仅在已加载的待办里做前端过滤，不额外请求接口 */}
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
              placeholder="搜索待办内容…"
              aria-label="搜索待办内容"
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
          options={TODO_CATEGORIES}
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
        <TodoList
          todos={filtered}
          loading={loading}
          onUpdate={(todo, patch) => void handleUpdate(todo, patch)}
          onDelete={(todo) => void handleDelete(todo)}
          onReorder={(draggedId, targetId, groupKey, segment) =>
            void handleReorder(draggedId, targetId, groupKey, segment)
          }
          emptyHint={emptyHint}
          emptyAction={emptyAction}
          // 筛选为「已完成」时整屏都是已完成段，默认折叠等于看不到内容，故强制展开
          expandDone={filter === 'done'}
        />
      </div>
    </AppLayout>
  );
};

export default Todo;
