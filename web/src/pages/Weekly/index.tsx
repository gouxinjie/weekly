/**
 * @component 工作台（周报）
 * @description 三栏骨架：左栏时间轴、中栏周报（展示态为封面卡片 + 渲染内容，编辑态为工具条 + 编辑器）、
 * 右栏抽屉（展示态为本周待办，编辑态为模板 / 插入 / 导出面板）
 * @author gouxinjie
 * @created 2026-09-18
 * @updated 2026-09-23
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import type { Editor } from '@tiptap/core';
import { toErrorMessage } from '@/api/client';
import { fetchWeekly, fetchWrittenWeeks, saveWeekly } from '@/api/weekly';
import AppLayout from '@/components/AppLayout';
import EditorPanel from '@/components/EditorPanel';
import EditorToolbar from '@/components/EditorToolbar';
import MarkdownEditor from '@/components/MarkdownEditor';
import type { MarkdownEditorHandle } from '@/components/MarkdownEditor';
import MarkdownPreview from '@/components/MarkdownPreview';
import Toast from '@/components/Toast';
import Select from '@/components/Select';
import type { SelectOption } from '@/components/Select';
import Tree from '@/components/Tree';
import WeeklyReference from '@/components/WeeklyReference';
import { AUTOSAVE_DELAY, MAX_CONTENT_CHARS, START_YEAR } from '@/constants';
import {
  countChars,
  formatTimeShort,
  formatWeekLabel,
  formatWeekMonthLabel,
  formatWeekOrdinalLabel,
  formatWeekRangeShort,
} from '@/utils/format';
import { getCurrentWeek, getWeekCount, getWeekRange, isValidWeek } from '@/utils/week';
import { navigateWithTransition } from '@/utils/routeTransition';
import type { EditorMode, SaveState } from '@/types/models';
import styles from './index.module.scss';

/** 各保存状态的展示文案 */
const SAVE_TEXT: Record<SaveState, string> = {
  idle: '',
  saving: '保存中',
  saved: '已保存',
  error: '保存失败',
};

/**
 * 解析顶栏搜索框输入，形如「2026 年第 15 周」「2026-15」
 * @param input - 用户输入
 * @returns 解析出的周次；无法解析或越界时返回 null
 */
const parseSearchInput = (input: string): { year: number; week: number } | null => {
  const matched = input.match(/(\d{4})\D*(\d{1,2})/);
  if (matched === null) return null;

  const year = Number(matched[1]);
  const week = Number(matched[2]);
  return isValidWeek(year, week) ? { year, week } : null;
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

  /** 顶栏年份可选项：从起点年份到当前年，文案统一带「年」后缀 */
  const yearOptions = useMemo<SelectOption[]>(() => {
    const options: SelectOption[] = [];
    for (let y = START_YEAR; y <= Math.max(currentWeek.year, year); y += 1) {
      options.push({ value: String(y), label: `${y} 年` });
    }
    return options;
  }, [currentWeek.year, year]);

  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState('');
  const [mode, setMode] = useState<EditorMode>('edit');
  const [drawerCollapsed, setDrawerCollapsed] = useState(false);
  const [written, setWritten] = useState<Set<string>>(new Set());
  const [range, setRange] = useState(() => getWeekRange(year, week));
  const [updatedAt, setUpdatedAt] = useState('');
  const [lastSavedAt, setLastSavedAt] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [toast, setToast] = useState('');
  const [editor, setEditor] = useState<Editor | null>(null);

  const editorRef = useRef<MarkdownEditorHandle | null>(null);
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

        // 未写过的周保持空编辑区：不自动注入模板，否则「点一下」就会触发自动保存，
        // 把模板写进库里变成「已写」。模板改由右栏「应用模板」按需注入。
        setContent(data.content);
        setRange({ start: data.weekStart, end: data.weekEnd });
        setUpdatedAt(data.updatedAt);
        // 有内容的周直接进入展示态，空周进入编辑态
        setMode(data.updatedAt === '' || data.content === '' ? 'edit' : 'preview');
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

  // 加载已写周次，用于时间轴的绿色圆点
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
      const now = new Date().toISOString();
      setSaveState('saved');
      setUpdatedAt(now);
      setLastSavedAt(now);
      setWritten((prev) => {
        const key = `${year}-${week}`;
        const next = new Set(prev);
        // 与服务端判定保持一致：内容为空不算「已写」，清空后绿点要跟着消失
        if (content.trim() === '') {
          next.delete(key);
        } else {
          next.add(key);
        }
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
      navigateWithTransition(navigate, `/weekly/${targetYear}/${targetWeek}`);
    },
    [year, week, content, persist, navigate],
  );

  /**
   * 上一周 / 下一周的目标周次（R-03）
   * @remarks 跨年时按 ISO 周数回退 / 前进：走到第 1 周再往前取上一年最后一周（可能是第 53 周），
   *          走到当年最后一周再往后进入下一年第 1 周；已到时间轴两端时为 null，按钮置灰。
   *          下一周不越过当前 ISO 年：再往后是尚未发生的年份，时间轴里也没有那些节点。
   *          当年内的未来周次（如第 38 周时往后到第 53 周）是允许的——它们已在时间轴上，
   *          与 R-10「可跳到 2026 年第 1 周及其后任意周」一致。
   */
  const weekNav = useMemo(() => {
    const weekTotal = getWeekCount(year);

    const prev =
      week > 1
        ? { year, week: week - 1 }
        : year > START_YEAR
          ? { year: year - 1, week: getWeekCount(year - 1) }
          : null;

    const next =
      week < weekTotal
        ? { year, week: week + 1 }
        : year < currentWeek.year
          ? { year: year + 1, week: 1 }
          : null;

    return { prev, next };
  }, [year, week, currentWeek.year]);

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

  // 切换周次后把内容区滚回顶部：新一周的内容从头看起，
  // 否则会停在上一周的滚动位置，看上去像「内容突然跳到了中间」。
  // 顺带清掉模式切换遗留的滚动恢复值，避免它在这之后把位置又设回去。
  // 编辑态时编辑器多半因 loading 卸载、ref 为空，setScrollTop 不生效——
  // 没关系，数据到达后编辑器重建，天然从顶部开始
  useEffect(() => {
    pendingScrollRef.current = null;
    const preview = previewRef.current;
    if (preview !== null) preview.scrollTop = 0;
    editorRef.current?.setScrollTop(0);
  }, [year, week]);

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

  /**
   * 发布：把当前内容立即落库后回到展示态
   * @returns 无
   * @remarks 保存失败时留在编辑态，避免用户误以为已经发布
   */
  const handlePublish = useCallback(async (): Promise<void> => {
    await persist();
    if (content === savedContentRef.current) changeMode('preview');
  }, [persist, content, changeMode]);

  /** 复制当前周报到剪贴板 */
  const handleCopy = useCallback(async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(content);
      setToast('已复制到剪贴板');
    } catch {
      setToast('复制失败，请手动选择内容复制');
    }
  }, [content]);

  /**
   * 应用模板：确认后覆盖当前内容
   * @param template - 模板内容，空串表示清空
   * @returns 无
   */
  const applyTemplate = useCallback((template: string): void => {
    const tip =
      template === '' ? '确定清空当前内容吗？' : '应用模板将覆盖当前内容，确定继续吗？';
    if (!window.confirm(tip)) return;
    setContent(template);
  }, []);

  /**
   * 顶栏搜索回车：解析并跳转到对应周次
   * @returns 无
   */
  const handleSearch = useCallback((): void => {
    const parsed = parseSearchInput(searchInput);
    if (parsed === null) {
      setToast('未找到匹配的周次，试试「2026 年第 15 周」');
      return;
    }
    setSearchInput('');
    void goWeek(parsed.year, parsed.week);
  }, [searchInput, goWeek]);

  // 全局快捷键：Ctrl+S 立即保存
  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if ((!event.ctrlKey && !event.metaKey) || event.key.toLowerCase() !== 's') return;
      event.preventDefault();
      void persist();
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

  const charCount = countChars(content);
  const isWritten = updatedAt !== '';
  const isEditing = mode === 'edit';

  /** 保存态徽标的文案（idle 且已写过时按「已保存」展示） */
  const saveChipText =
    saveState === 'idle' ? (isWritten ? '已保存' : '未保存') : SAVE_TEXT[saveState];

  /** 保存态徽标的样式：失败为红底，未保存为灰底，其余为绿底 */
  const saveChipClass =
    saveState === 'error'
      ? styles.saveChipError
      : saveState === 'idle' && !isWritten
        ? styles.saveChipIdle
        : styles.saveChip;

  /** 卡片标题旁的日期区间，形如「09/14 - 09/20」 */
  const rangeLabel = formatWeekRangeShort(range.start, range.end).replace('–', ' - ');

  return (
    <AppLayout
      activeTab="weekly"
      leftColumn={
        <Tree
          year={year}
          week={week}
          written={written}
          onChange={(targetYear, targetWeek) => void goWeek(targetYear, targetWeek)}
        />
      }
      topbar={
        <>
          {/* 年份切换 */}
          <Select
            value={String(year)}
            options={yearOptions}
            ariaLabel="切换年份"
            size="md"
            variant="ghost"
            onChange={(next) => {
              const target = Number(next);
              void goWeek(target, target === year ? week : 1);
            }}
          />

          <div className={styles.topbarRight}>
            <input
              className={styles.search}
              value={searchInput}
              placeholder="搜索周次内容…"
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleSearch();
              }}
            />

            <button
              type="button"
              className={styles.bell}
              aria-label="通知"
              title="通知"
              onClick={() => setToast('暂无新通知')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M6 9.5a6 6 0 0 1 12 0c0 4 1.6 5.4 1.6 5.4H4.4S6 13.5 6 9.5Z" strokeLinejoin="round" />
                <path d="M10 18.4a2 2 0 0 0 4 0" strokeLinecap="round" />
              </svg>
              <span className={styles.bellDot} aria-hidden />
            </button>

            {/* 顶栏头像：与左栏账号区同款 */}
            <span className={styles.avatar} aria-hidden>
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 12.2a4.1 4.1 0 1 0 0-8.2 4.1 4.1 0 0 0 0 8.2Zm0 1.9c-3.6 0-7 1.9-7 4.4 0 .9.7 1.5 1.6 1.5h10.8c.9 0 1.6-.6 1.6-1.5 0-2.5-3.4-4.4-7-4.4Z" />
              </svg>
            </span>
          </div>
        </>
      }
      drawer={
        isEditing ? (
          <EditorPanel
            editor={editor}
            onApplyTemplate={applyTemplate}
            onExport={handleExport}
          />
        ) : (
          // 跳待办页时把当前查看的周带上，新建的待办才会默认落到这一周而不是「今天所在的周」
          <WeeklyReference
            year={year}
            week={week}
            onGoTodo={() => navigateWithTransition(navigate, `/todo?year=${year}&week=${week}`)}
          />
        )
      }
      drawerCollapsed={drawerCollapsed}
      onToggleDrawer={() => setDrawerCollapsed(!drawerCollapsed)}
    >
      {/* 编辑态头部：第一行返回，第二行标题 + 保存态 + 预览 / 发布 */}
      {isEditing ? (
        <header className={styles.editHeader}>
          {/* 第一行：左侧返回，右侧「上一周 / 下一周」快捷切换（R-03） */}
          <div className={styles.editHeaderTop}>
            <button
              type="button"
              className={styles.back}
              onClick={() => changeMode('preview')}
            >
              <svg className={styles.backIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                <path d="m14 6-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              返回
            </button>

            <div className={styles.weekNav}>
              <button
                type="button"
                className={styles.weekNavButton}
                disabled={weekNav.prev === null}
                onClick={() => {
                  if (weekNav.prev !== null) void goWeek(weekNav.prev.year, weekNav.prev.week);
                }}
              >
                <svg className={styles.weekNavIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                  <path d="m14 6-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                上一周
              </button>

              <button
                type="button"
                className={styles.weekNavButton}
                disabled={weekNav.next === null}
                onClick={() => {
                  if (weekNav.next !== null) void goWeek(weekNav.next.year, weekNav.next.week);
                }}
              >
                下一周
                <svg className={styles.weekNavIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                  <path d="m10 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>

          <div className={styles.editHeaderMain}>
            <h1 className={styles.editTitle}>{formatWeekLabel(year, week)} · 周报编辑</h1>

            <div className={styles.editHeaderRight}>
              <span className={styles.autoSave}>
                {lastSavedAt === ''
                  ? '自动保存'
                  : `自动保存 ${formatTimeShort(lastSavedAt).slice(-5)}`}
              </span>
              <span className={saveChipClass} aria-live="polite">
                {saveChipText}
              </span>
              <button
                type="button"
                className={styles.ghostButton}
                onClick={() => changeMode('preview')}
              >
                预览
              </button>
              <button
                type="button"
                className={styles.publishButton}
                onClick={() => void handlePublish()}
                disabled={saveState === 'saving'}
              >
                发布
              </button>
            </div>
          </div>
        </header>
      ) : null}

      {/* 展示态：封面卡片 + 渲染内容 + 元信息 */}
      {!isEditing ? (
        <div className={styles.displayScroll} ref={previewRef}>
          <div className={styles.displayBody}>
            <section className={styles.weekCard}>
              {/* 全宽封面：复用登录页的风景图，保证两处视觉一致 */}
              <div className={styles.cover} aria-hidden />

              <header className={styles.cardHead}>
                <h1 className={styles.cardTitle}>{formatWeekOrdinalLabel(week)}</h1>
                <span className={styles.cardRange}>{rangeLabel}</span>
                <span className={styles.cardMonthWeek}>{formatWeekMonthLabel(year, week)}</span>
                <span className={styles.cardSpacer} />
                {isWritten ? <span className={styles.writtenBadge}>已写</span> : null}
                {/* 编辑入口：切到编辑态修改本周内容，放在标题行右侧 */}
                <button
                  type="button"
                  className={styles.editButton}
                  onClick={() => changeMode('edit')}
                >
                  编辑
                </button>
              </header>

              <div className={styles.cardBody}>
                {loading ? (
                  <p className={styles.hint}>加载中…</p>
                ) : loadError !== '' ? (
                  <p className={styles.error}>{loadError}</p>
                ) : (
                  <MarkdownPreview source={content} />
                )}
              </div>

              <footer className={styles.cardMeta}>
                <span className={styles.metaTime}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
                    <circle cx="12" cy="12" r="8.2" />
                    <path d="M12 7.6V12l3 1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {updatedAt === '' ? '尚未保存' : `更新于 ${formatTimeShort(updatedAt)}`}
                </span>
                <span>字数 {charCount}</span>
              </footer>
            </section>
          </div>
        </div>
      ) : (
        <>
          {/* 编辑区容器：工具条与编辑器共用一个带边框的圆角块 */}
          <div className={styles.editorBox}>
            <EditorToolbar
              editor={editor}
              formatDisabled={!isEditing || loading}
              onExport={handleExport}
              onCopy={() => void handleCopy()}
            />

            {loading ? (
              <p className={styles.hint}>加载中…</p>
            ) : loadError !== '' ? (
              <p className={styles.error}>{loadError}</p>
            ) : (
              <MarkdownEditor
                value={content}
                onChange={setContent}
                editorRef={editorRef}
                onEditorReady={setEditor}
              />
            )}
          </div>

          {/* 编辑态底部状态栏：Markdown 编辑 + 字数计数 */}
          <footer className={styles.statusBar}>
            <span className={styles.statusChip}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <rect x="2.6" y="7.4" width="18.8" height="9.2" rx="4.6" />
                <circle cx="8.4" cy="12" r="2.4" fill="currentColor" stroke="none" />
              </svg>
              Markdown 编辑
            </span>
            <span className={styles.statusCount}>
              {charCount} / {MAX_CONTENT_CHARS}
            </span>
          </footer>
        </>
      )}

      {saveError !== '' ? <p className={styles.saveError}>{saveError}</p> : null}

      <Toast message={toast} onDismiss={hideToast} />
    </AppLayout>
  );
};

export default Weekly;
