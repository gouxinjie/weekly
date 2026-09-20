/**
 * @component 工作台（周报）
 * @description 三栏骨架：左栏两层树、中栏 Markdown 编辑与预览、右栏「本周参考」只读抽屉
 * @author gouxinjie
 * @created 2026-09-18
 * @updated 2026-09-18
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import type { Editor } from '@tiptap/core';
import { toErrorMessage } from '@/api/client';
import { fetchWeekly, fetchWrittenWeeks, saveWeekly } from '@/api/weekly';
import AppLayout from '@/components/AppLayout';
import EditorToolbar from '@/components/EditorToolbar';
import MarkdownEditor from '@/components/MarkdownEditor';
import type { MarkdownEditorHandle } from '@/components/MarkdownEditor';
import MarkdownPreview from '@/components/MarkdownPreview';
import Toast from '@/components/Toast';
import Tree from '@/components/Tree';
import type { TreeHandle } from '@/components/Tree';
import WeeklyReference from '@/components/WeeklyReference';
import { AUTOSAVE_DELAY, WEEKLY_TEMPLATE } from '@/constants';
import { countChars, formatWeekLabel, formatWeekRangeFull } from '@/utils/format';
import { getCurrentWeek, getWeekRange, isValidWeek, shiftWeek } from '@/utils/week';
import type { EditorMode, SaveState } from '@/types/models';
import styles from './index.module.scss';

/** 各保存状态的展示文案 */
const SAVE_TEXT: Record<SaveState, string> = {
  idle: '',
  saving: '保存中…',
  saved: '已保存',
  error: '保存失败',
};

/**
 * 工作台（周报）
 * @returns 页面节点
 */
const Weekly = () => {
  const params = useParams<{ year: string; week: string }>();
  const navigate = useNavigate();

  const year = Number(params.year);
  const week = Number(params.week);
  const valid = isValidWeek(year, week);

  const currentWeek = useMemo(() => getCurrentWeek(), []);
  const currentWeekPath = `/weekly/${currentWeek.year}/${currentWeek.week}`;

  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState('');
  const [mode, setMode] = useState<EditorMode>('edit');
  const [drawerCollapsed, setDrawerCollapsed] = useState(false);
  const [written, setWritten] = useState<Set<string>>(new Set());
  const [range, setRange] = useState(() => getWeekRange(year, week));
  const [neverWritten, setNeverWritten] = useState(false);
  const [toast, setToast] = useState('');
  const [editor, setEditor] = useState<Editor | null>(null);

  const editorRef = useRef<MarkdownEditorHandle | null>(null);
  const treeRef = useRef<TreeHandle | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);

  /** 已落库的内容，用于判断是否还需要保存 */
  const savedContentRef = useRef('');
  /** 当前 content 归属于哪个周次，防止切换周次时把旧内容写到新周 */
  const contentOwnerRef = useRef<{ year: number; week: number } | null>(null);
  /** 模式切换前记录的滚动位置 */
  const pendingScrollRef = useRef<number | null>(null);

  const hideToast = useCallback((): void => setToast(''), []);

  // 加载当前周的周报
  useEffect(() => {
    if (!valid) return undefined;

    let active = true;
    contentOwnerRef.current = null;
    setLoading(true);
    setLoadError('');
    setSaveState('idle');
    setSaveError('');

    void fetchWeekly(year, week)
      .then((data) => {
        if (!active) return;

        // 只有从未写过（updatedAt 为空）才注入模板；用户清空过就不再重复注入
        const text = data.updatedAt === '' ? WEEKLY_TEMPLATE : data.content;
        setContent(text);
        setRange({ start: data.weekStart, end: data.weekEnd });
        setNeverWritten(data.updatedAt === '');
        savedContentRef.current = data.content;
        contentOwnerRef.current = { year, week };
      })
      .catch((error: unknown) => {
        if (active) setLoadError(toErrorMessage(error, '加载失败，请稍后重试'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [year, week, valid]);

  // 加载已写周次，用于树的绿色角标
  useEffect(() => {
    let active = true;

    void fetchWrittenWeeks()
      .then((list) => {
        if (!active) return;
        setWritten(new Set(list.map((item) => `${item.year}-${item.week}`)));
      })
      .catch(() => {
        // 角标属于辅助信息，失败时不打断主流程
      });

    return () => {
      active = false;
    };
  }, []);

  /** 立即保存当前内容 */
  const persist = useCallback(async (): Promise<void> => {
    if (!valid) return;

    setSaveState('saving');
    setSaveError('');
    try {
      await saveWeekly(year, week, content);
      savedContentRef.current = content;
      setSaveState('saved');
      setNeverWritten(false);
      setWritten((prev) => {
        const next = new Set(prev);
        next.add(`${year}-${week}`);
        return next;
      });
    } catch (error) {
      setSaveState('error');
      setSaveError(toErrorMessage(error, '保存失败，请稍后重试'));
    }
  }, [valid, year, week, content]);

  // 自动保存：输入停止 AUTOSAVE_DELAY 后落库
  useEffect(() => {
    if (loading || !valid) return undefined;

    const owner = contentOwnerRef.current;
    // 内容还不属于当前周次（正在切换周次）时不保存
    if (owner === null || owner.year !== year || owner.week !== week) return undefined;
    if (content === savedContentRef.current) return undefined;

    const timer = window.setTimeout(() => {
      void persist();
    }, AUTOSAVE_DELAY);

    return () => {
      window.clearTimeout(timer);
    };
  }, [content, year, week, loading, valid, persist]);

  /**
   * 切换到指定周次，切换前先把未保存内容落库
   * @param targetYear - 目标 ISO 年
   * @param targetWeek - 目标 ISO 周次
   * @returns 无
   */
  const goWeek = useCallback(
    async (targetYear: number, targetWeek: number): Promise<void> => {
      const owner = contentOwnerRef.current;
      const dirty =
        owner !== null &&
        owner.year === year &&
        owner.week === week &&
        content !== savedContentRef.current;

      if (dirty) {
        await persist();
      }
      navigate(`/weekly/${targetYear}/${targetWeek}`);
    },
    [year, week, content, persist, navigate],
  );

  /**
   * 切换编辑 / 预览模式并保留滚动位置
   * @param next - 目标模式
   * @returns 无
   */
  const changeMode = useCallback(
    (next: EditorMode): void => {
      if (next === mode) return;
      pendingScrollRef.current =
        mode === 'edit'
          ? (editorRef.current?.getScrollTop() ?? 0)
          : (previewRef.current?.scrollTop ?? 0);
      setMode(next);
    },
    [mode],
  );

  // 模式切换后恢复滚动位置
  useEffect(() => {
    const top = pendingScrollRef.current;
    if (top === null) return undefined;

    pendingScrollRef.current = null;
    const frame = window.requestAnimationFrame(() => {
      if (mode === 'edit') {
        editorRef.current?.setScrollTop(top);
      } else if (previewRef.current !== null) {
        previewRef.current.scrollTop = top;
      }
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [mode]);

  /** 导出当前周报为 Markdown 文件 */
  const handleExport = useCallback((): void => {
    const header = `# ${formatWeekLabel(year, week)}（${range.start} ~ ${range.end}）\n\n`;
    const blob = new Blob([header + content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `weekly-${year}-W${week}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setToast('已导出 Markdown 文件');
  }, [year, week, range, content]);

  /** 复制当前周报到剪贴板 */
  const handleCopy = useCallback(async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(content);
      setToast('已复制到剪贴板');
    } catch {
      setToast('复制失败，请手动选择内容复制');
    }
  }, [content]);

  /** 清空模板内容 */
  const clearTemplate = useCallback((): void => {
    setContent('');
  }, []);

  // 全局快捷键：Ctrl+S 立即保存、Ctrl+B 折叠展开、Ctrl+K 打开跳转
  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (!event.ctrlKey && !event.metaKey) return;

      const key = event.key.toLowerCase();
      if (key === 's') {
        event.preventDefault();
        void persist();
        return;
      }
      if (key === 'b') {
        event.preventDefault();
        treeRef.current?.toggleAll();
        return;
      }
      if (key === 'k') {
        event.preventDefault();
        treeRef.current?.focusJump();
      }
    };

    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
    };
  }, [persist]);

  // 参数非法时回到当前周
  if (!valid) {
    return <Navigate to={currentWeekPath} replace />;
  }

  const prev = shiftWeek(year, week, -1);
  const next = shiftWeek(year, week, 1);
  const charCount = countChars(content);

  return (
    <AppLayout
      activeTab="weekly"
      sidebar={
        <Tree
          year={year}
          week={week}
          written={written}
          treeRef={treeRef}
          onChange={(targetYear, targetWeek) => void goWeek(targetYear, targetWeek)}
        />
      }
      drawer={<WeeklyReference year={year} week={week} onGoMemo={() => navigate('/memo')} />}
      drawerCollapsed={drawerCollapsed}
      onToggleDrawer={() => setDrawerCollapsed(!drawerCollapsed)}
    >
      <header className={styles.header}>
        <div className={styles.titleArea}>
          <h1 className={styles.title}>{formatWeekLabel(year, week)}</h1>
          <span className={styles.range}>{formatWeekRangeFull(year, range.start, range.end)}</span>
        </div>

        <div className={styles.headerRight}>
          <span
            className={saveState === 'error' ? styles.saveStateError : styles.saveState}
            aria-live="polite"
          >
            {SAVE_TEXT[saveState]}
          </span>
          <span className={styles.charCount}>{charCount} 字</span>

          <button
            type="button"
            className={styles.navButton}
            disabled={prev === null}
            onClick={() => {
              if (prev !== null) void goWeek(prev.year, prev.week);
            }}
          >
            上一周
          </button>
          <button
            type="button"
            className={styles.navButton}
            disabled={next === null}
            onClick={() => {
              if (next !== null) void goWeek(next.year, next.week);
            }}
          >
            下一周
          </button>

          <div className={styles.modeSwitch}>
            <button
              type="button"
              className={mode === 'edit' ? styles.modeActive : styles.mode}
              onClick={() => changeMode('edit')}
            >
              编辑
            </button>
            <button
              type="button"
              className={mode === 'preview' ? styles.modeActive : styles.mode}
              onClick={() => changeMode('preview')}
            >
              预览
            </button>
          </div>
        </div>
      </header>

      <EditorToolbar
        editor={editor}
        formatDisabled={mode !== 'edit' || loading}
        onExport={handleExport}
        onCopy={() => void handleCopy()}
      />

      {neverWritten ? (
        <div className={styles.emptyBar}>
          <span>第 {week} 周还没写</span>
          <button type="button" className={styles.emptyAction} onClick={clearTemplate}>
            清空模板
          </button>
        </div>
      ) : null}

      {loading ? (
        <p className={styles.hint}>加载中…</p>
      ) : loadError !== '' ? (
        <p className={styles.error}>{loadError}</p>
      ) : mode === 'edit' ? (
        <MarkdownEditor
          value={content}
          onChange={setContent}
          editorRef={editorRef}
          onEditorReady={setEditor}
        />
      ) : (
        <MarkdownPreview source={content} scrollRef={previewRef} />
      )}

      {saveError !== '' ? <p className={styles.saveError}>{saveError}</p> : null}

      <Toast message={toast} onDismiss={hideToast} />
    </AppLayout>
  );
};

export default Weekly;
