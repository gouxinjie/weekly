/**
 * @component 工作台（便签）
 * @description 独立模块的便签墙：页签栏 + 中栏，无左列、无右栏。
 * 中栏为「标题 + 搜索 + 新建」与多列网格的便签卡片；卡内直接编辑纯文本，
 * 输入停止 AUTOSAVE_DELAY 后落库（每张便签各有一套保存态）
 * @author gouxinjie
 * @created 2026-09-23
 * @updated 2026-09-23
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, toErrorMessage } from '@/api/client';
import { createNote, deleteNote, fetchNotes, updateNote } from '@/api/note';
import AppLayout from '@/components/AppLayout';
import ConfirmDialog from '@/components/ConfirmDialog';
import NoteCard from '@/components/NoteCard';
import { AUTOSAVE_DELAY } from '@/constants';
import type { UpdateNoteBody } from '@/types/api';
import type { Note, SaveState } from '@/types/models';
import styles from './index.module.scss';

/**
 * 重排便签
 * @param list - 便签列表
 * @returns 重排后的新数组
 * @remarks 与服务端 listNotes 的排序保持一致（置顶优先、新的在前），
 * 否则本地改动置顶后卡片位置会与服务端不一致，刷新一次就跳位。
 */
const sortNotes = (list: Note[]): Note[] =>
  [...list].sort((a, b) => (a.pinned === b.pinned ? b.id - a.id : a.pinned ? -1 : 1));

/**
 * 工作台（便签）
 * @returns 页面节点
 */
const Notes = () => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  /** 加载失败：与下面的 error 分开，避免「加载失败」被当成「没有便签」 */
  const [loadError, setLoadError] = useState('');
  /** 操作失败（新建 / 保存 / 删除）：就地显示在标题行下方 */
  const [error, setError] = useState('');
  const [keyword, setKeyword] = useState('');
  const [creating, setCreating] = useState(false);
  /** 每张便签各自的保存态 */
  const [saveStates, setSaveStates] = useState<Record<number, SaveState>>({});
  /** 待删除的便签，非 null 时弹出二次确认 */
  const [pendingDelete, setPendingDelete] = useState<Note | null>(null);
  /** 删除请求是否在处理中 */
  const [deleting, setDeleting] = useState(false);
  /** 新建后需要自动聚焦的便签 ID；聚焦完成即由 handleAutoFocused 清空 */
  const [focusId, setFocusId] = useState<number | null>(null);

  /** 每张便签的自动保存定时器 */
  const timersRef = useRef(new Map<number, number>());
  /** 每张便签尚未落库的完整提交体 */
  const pendingRef = useRef(new Map<number, UpdateNoteBody>());
  /** 正在请求落库的便签：保证同一张便签同时只有一个请求在途，避免乱序写入 */
  const inFlightRef = useRef(new Set<number>());
  /**
   * 本次会话新建、且从未写过内容的便签
   * @remarks 这类便签内容为空且离开焦点时直接丢弃，便签墙上不会留下空白卡片；
   * 而「本来就存在、后来被清空」的便签不在其中，保留为一张可继续写的空纸。
   */
  const freshIdsRef = useRef(new Set<number>());
  /**
   * 正在二次确认删除的便签 ID
   * @remarks 二次确认弹窗打开时会把焦点抢到弹窗按钮上，卡片会收到一次「焦点移出」；
   * 用 ref 记住目标，避免那次失焦把待删除的空白便签先丢掉。
   * 用 ref 而不是 state：失焦回调要保持稳定引用，否则每张卡片都会被重新渲染。
   */
  const pendingDeleteIdRef = useRef<number | null>(null);
  /** 组件是否仍挂载：异步回调里避免对已卸载的组件 setState */
  const mountedRef = useRef(true);

  /** 加载全部便签：首次进入与「加载失败」后的重试都走这里 */
  const loadNotes = useCallback(async (): Promise<void> => {
    setLoading(true);
    setLoadError('');
    try {
      const list = await fetchNotes();
      if (!mountedRef.current) return;
      setNotes(list);
    } catch (err) {
      if (!mountedRef.current) return;
      setLoadError(toErrorMessage(err, '加载失败，请稍后重试'));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  // 首次加载
  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  // 首次加载即把 mountedRef 归位；卸载时停掉定时器，并把尚未落库的改动补发一次
  useEffect(() => {
    const timers = timersRef.current;
    const pending = pendingRef.current;
    const inFlight = inFlightRef.current;
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      for (const timer of timers.values()) window.clearTimeout(timer);
      timers.clear();

      /*
       * 补发还没落库的改动——切到别的页签不该丢掉最后几个字。
       * 已被「删除 / 丢弃」的便签无需补发（服务端已无此行，晚到的 PUT 只会拿到 404）。
       * 正在请求中的那些不在这里发：flush 的收尾逻辑会在请求结束后自动把更新的内容补上，
       * 由它统一串行，才能避免「旧内容晚到、覆盖新内容」。
       */
      for (const [id, body] of pending) {
        if (inFlight.has(id)) continue;
        void updateNote(id, body).catch(() => undefined);
      }
      pending.clear();
    };
  }, []);

  /**
   * 记录某张便签的保存态
   * @param id - 便签 ID
   * @param state - 保存状态
   * @returns 无
   */
  const setSaveState = useCallback((id: number, state: SaveState): void => {
    if (!mountedRef.current) return;
    setSaveStates((prev) => ({ ...prev, [id]: state }));
  }, []);

  /**
   * 立即把某张便签落库
   * @param id - 便签 ID
   * @param body - 完整提交体
   * @returns 无
   * @remarks 便签已被删除或丢弃时服务端会返回 NOTE_NOT_FOUND：
   * 这是「用户自己刚删掉、请求还在路上」的正常结果，不当作保存失败提示出来。
   */
  const persist = useCallback(
    async (id: number, body: UpdateNoteBody): Promise<void> => {
      setSaveState(id, 'saving');
      try {
        await updateNote(id, body);
        // 只有仍是最新提交体时才清掉待发记录；期间又输入的新内容要继续留着
        if (pendingRef.current.get(id) === body) pendingRef.current.delete(id);
        setSaveState(id, 'saved');
      } catch (err) {
        if (err instanceof ApiError && err.code === 'NOTE_NOT_FOUND') {
          pendingRef.current.delete(id);
          return;
        }
        setSaveState(id, 'error');
        if (mountedRef.current) setError(toErrorMessage(err, '保存失败，请稍后重试'));
      }
    },
    [setSaveState],
  );

  /**
   * 把一张便签的最新内容落库，并在收尾时补发期间新攒的内容
   * @param id - 便签 ID
   * @returns 无
   * @remarks 同一张便签同时只允许一个请求在途：两个请求并发时，
   * 若先发的（旧内容）后到，就会把新内容覆盖成旧内容。
   * 这里的做法是「在途时只攒不发」，等请求结束再发最新的那一版。
   */
  const flush = useCallback(async (id: number): Promise<void> => {
    if (inFlightRef.current.has(id)) return;

    const body = pendingRef.current.get(id);
    if (body === undefined) return;

    inFlightRef.current.add(id);
    try {
      await persist(id, body);
    } finally {
      inFlightRef.current.delete(id);
    }

    // 在途期间又输入过（待发内容已不是刚发出去的那一版）才继续发；
    // 失败时待发的仍是同一版，不会在这里变成死循环重试
    if (pendingRef.current.get(id) !== undefined && pendingRef.current.get(id) !== body) {
      void flush(id);
    }
  }, [persist]);

  /**
   * 排一次自动保存（同一张便签的连续输入只保留最后一次）
   * @param id - 便签 ID
   * @param body - 完整提交体
   * @returns 无
   */
  const scheduleSave = useCallback(
    (id: number, body: UpdateNoteBody): void => {
      pendingRef.current.set(id, body);

      const existing = timersRef.current.get(id);
      if (existing !== undefined) window.clearTimeout(existing);

      timersRef.current.set(
        id,
        window.setTimeout(() => {
          timersRef.current.delete(id);
          void flush(id);
        }, AUTOSAVE_DELAY),
      );
    },
    [flush],
  );

  /**
   * 本地更新某张便签并排入自动保存
   * @param note - 目标便签
   * @param patch - 需要变更的字段
   * @returns 无
   */
  const handleChange = useCallback(
    (note: Note, patch: Partial<UpdateNoteBody>): void => {
      setNotes((prev) => {
        const next = prev.map((item) => (item.id === note.id ? { ...item, ...patch } : item));
        // 置顶会改变排序，其余变更（内容 / 颜色）不动顺序，避免打字时卡片跳位
        return patch.pinned === undefined ? next : sortNotes(next);
      });

      // 写过内容就不再是「空白新便签」，之后即使清空也不会被自动丢弃
      if (patch.content !== undefined && patch.content.trim() !== '') {
        freshIdsRef.current.delete(note.id);
      }

      const body: UpdateNoteBody = {
        content: patch.content !== undefined ? patch.content : note.content,
        color: patch.color !== undefined ? patch.color : note.color,
        pinned: patch.pinned !== undefined ? patch.pinned : note.pinned,
      };
      scheduleSave(note.id, body);
    },
    [scheduleSave],
  );

  /** 新建一张空白便签并聚焦，让用户可以直接开始写 */
  const handleCreate = useCallback(async (): Promise<void> => {
    if (creating) return;

    setCreating(true);
    setError('');
    try {
      const created = await createNote({});
      freshIdsRef.current.add(created.id);
      setNotes((prev) => sortNotes([created, ...prev]));
      setFocusId(created.id);
    } catch (err) {
      setError(toErrorMessage(err, '新建失败，请稍后重试'));
    } finally {
      setCreating(false);
    }
  }, [creating]);

  /**
   * 便签已完成自动聚焦：撤下「待聚焦」标记
   * @returns 无
   * @remarks 标记留着不清，会让这张卡片在因搜索 / 筛选重新挂载时又抢一次焦点。
   */
  const handleAutoFocused = useCallback((): void => setFocusId(null), []);

  /**
   * 丢弃一张空白的新便签
   * @param note - 目标便签
   * @returns 无
   * @remarks 只处理「本次新建、从未写过内容、也没被特意保留（未置顶、未改色）」的便签。
   * 服务端那张也一并删除；删除失败就让它留着（用户可手动删），不为此打断当前操作。
   */
  const handleDiscard = useCallback((note: Note): void => {
    // 正在二次确认删除的那张不参与失焦丢弃：弹窗抢焦点会让卡片收到一次「焦点移出」，
    // 若不拦住，便签会在用户点「确认」之前就先消失，确认时还会收到一个「便签不存在」
    if (pendingDeleteIdRef.current === note.id) return;
    if (!freshIdsRef.current.has(note.id)) return;
    if (note.content.trim() !== '' || note.pinned || note.color !== '') return;

    freshIdsRef.current.delete(note.id);
    pendingRef.current.delete(note.id);
    const timer = timersRef.current.get(note.id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timersRef.current.delete(note.id);
    }

    setNotes((prev) => prev.filter((item) => item.id !== note.id));
    void deleteNote(note.id).catch(() => undefined);
  }, []);

  /**
   * 请求删除某张便签（打开二次确认）
   * @param note - 目标便签
   * @returns 无
   * @remarks 用 useCallback 保持引用稳定，配合 NoteCard 的 memo，
   * 否则每次击键都会因回调换了引用而重渲染整面便签墙。
   */
  const requestDelete = useCallback((note: Note): void => {
    pendingDeleteIdRef.current = note.id;
    setPendingDelete(note);
  }, []);

  /** 取消删除：清掉「正在确认删除」的标记 */
  const cancelDelete = useCallback((): void => {
    pendingDeleteIdRef.current = null;
    setPendingDelete(null);
  }, []);

  /** 确认删除：清掉它的待发保存后再落库删除 */
  const confirmDelete = useCallback(async (): Promise<void> => {
    const target = pendingDelete;
    if (target === null) return;

    setDeleting(true);
    setError('');
    try {
      await deleteNote(target.id);

      // 先取消它尚未落库的定时保存，否则删掉之后还会再发一次更新
      const timer = timersRef.current.get(target.id);
      if (timer !== undefined) {
        window.clearTimeout(timer);
        timersRef.current.delete(target.id);
      }
      pendingRef.current.delete(target.id);
      freshIdsRef.current.delete(target.id);

      setNotes((prev) => prev.filter((item) => item.id !== target.id));
      setSaveStates((prev) => {
        const next = { ...prev };
        delete next[target.id];
        return next;
      });
      pendingDeleteIdRef.current = null;
      setPendingDelete(null);
    } catch (err) {
      setError(toErrorMessage(err, '删除失败，请稍后重试'));
    } finally {
      setDeleting(false);
    }
  }, [pendingDelete]);

  /** 关键词只在已加载的便签里做前端过滤，不额外请求接口 */
  const filtered = useMemo(() => {
    const text = keyword.trim().toLowerCase();
    if (text === '') return notes;
    return notes.filter((item) => item.content.toLowerCase().includes(text));
  }, [notes, keyword]);

  const searching = keyword.trim() !== '';

  return (
    <AppLayout activeTab="notes">
      {/* 标题行：便签 + 搜索框 + 新建按钮（与待办页同一套语言） */}
      <header className={styles.header}>
        <h1 className={styles.title}>便签</h1>

        <div className={styles.headerRight}>
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
              placeholder="搜索便签内容…"
              aria-label="搜索便签内容"
              onChange={(event) => setKeyword(event.target.value)}
            />
          </label>

          <button
            type="button"
            className={styles.create}
            disabled={creating}
            onClick={() => void handleCreate()}
          >
            ＋ 新建
          </button>
        </div>
      </header>

      {error !== '' ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.body}>
        {loading ? (
          <p className={styles.hint}>加载中…</p>
        ) : loadError !== '' ? (
          // 加载失败：只给错误与重试，不再叠一层「还没有便签」的空态——两者同时出现自相矛盾
          <div className={styles.empty}>
            <p className={styles.loadError}>{loadError}</p>
            <button
              type="button"
              className={styles.emptyAction}
              onClick={() => void loadNotes()}
            >
              <svg
                className={styles.emptyActionIcon}
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M13.1 7.6a5.2 5.2 0 1 0-.6 3.1" />
                <path d="M13.3 3.6v4h-4" />
              </svg>
              重试
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.hint}>
              {searching ? '没有匹配的便签' : '还没有便签，点「＋ 新建」随手记一笔'}
            </p>
            <button
              type="button"
              className={styles.emptyAction}
              onClick={() => {
                if (searching) {
                  setKeyword('');
                  return;
                }
                void handleCreate();
              }}
            >
              {/* 图标随文案切换：新建为加号，清空搜索为叉号 */}
              <svg
                className={styles.emptyActionIcon}
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                aria-hidden
              >
                {searching ? <path d="m4.6 4.6 6.8 6.8M11.4 4.6 4.6 11.4" /> : <path d="M8 3.6v8.8M3.6 8h8.8" />}
              </svg>
              {searching ? '清空搜索' : '新建便签'}
            </button>
          </div>
        ) : (
          <div className={styles.grid}>
            {filtered.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                autoFocus={focusId === note.id}
                saveState={saveStates[note.id] ?? 'idle'}
                onChange={handleChange}
                onDelete={requestDelete}
                onDiscard={handleDiscard}
                onAutoFocused={handleAutoFocused}
              />
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="删除这张便签？"
        description="删除后无法恢复。"
        confirmText="删除"
        tone="danger"
        pending={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={cancelDelete}
      />
    </AppLayout>
  );
};

export default Notes;
