/**
 * @component 批量导出弹窗
 * @description 把「本年度 / 最近 3 个月 / 最近 6 个月 / 自定义周区间」内的周报合并导出为**单个** Markdown 文件。
 * 通过 portal 渲染到 body 避免被抽屉裁剪；支持 Esc 与点击遮罩关闭、打开时锁定页面滚动、
 * 焦点落在第一个范围选项上并在关闭后还原；切换范围时即时算出覆盖的周次并展示摘要，导出前不发请求。
 * @author gouxinjie
 * @created 2026-10-09
 * @updated 2026-10-09
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import dayjs from 'dayjs';
import { fetchWeeklyExport } from '@/api/weekly';
import { toErrorMessage } from '@/api/client';
import Select from '@/components/Select';
import type { SelectOption } from '@/components/Select';
import { MAX_WEEK, START_YEAR } from '@/constants';
import { cx } from '@/utils/classNames';
import { buildExportFileName, buildWeeklyMarkdown, downloadMarkdown } from '@/utils/export';
import { formatWeekLabel } from '@/utils/format';
import {
  getCurrentWeek,
  getWeekCount,
  listWeeksInRange,
  listWeeksInRecentMonths,
  listWeeksOfYear,
} from '@/utils/week';
import type { WeekRef } from '@/types/models';
import styles from './index.module.scss';

/** 导出范围标识 */
type ExportScope = 'year' | 'recent3' | 'recent6' | 'custom';

/** 范围选项定义，顺序即弹窗中的排列顺序 */
const SCOPE_OPTIONS: { value: ExportScope; label: string; hint: string }[] = [
  { value: 'year', label: '本年度', hint: '该年写过的全部周报' },
  { value: 'recent3', label: '最近 3 个月', hint: '按周归属的月份统计' },
  { value: 'recent6', label: '最近 6 个月', hint: '按周归属的月份统计' },
  { value: 'custom', label: '自定义', hint: '指定年份与起止周' },
];

/** ExportDialog 属性 */
interface ExportDialogProps {
  /** 是否展示，false 时完全不渲染 */
  open: boolean;
  /** 当前查看的年份，作为「本年度」的目标年与自定义范围的默认年 */
  year: number;
  /** 关闭 / 取消回调（Esc、点击遮罩、取消按钮共用） */
  onClose: () => void;
  /** 导出成功回调，参数为给用户看的结果文案，由页面用 Toast 展示 */
  onExported: (message: string) => void;
}

/**
 * 批量导出弹窗
 * @param props - 见 ExportDialogProps
 * @returns 弹窗节点或 null
 */
const ExportDialog = ({ open, year, onClose, onExported }: ExportDialogProps) => {
  const currentWeek = useMemo(() => getCurrentWeek(), []);

  const [scope, setScope] = useState<ExportScope>('year');
  const [customYear, setCustomYear] = useState(year);
  const [fromWeek, setFromWeek] = useState(1);
  const [toWeek, setToWeek] = useState(() => getWeekCount(year));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const panelRef = useRef<HTMLDivElement | null>(null);
  const firstScopeRef = useRef<HTMLInputElement | null>(null);

  // 用 ref 保存最新回调与处理中状态，避免它们变化时重建键盘监听、导致焦点被反复重置
  const onCloseRef = useRef(onClose);
  const pendingRef = useRef(pending);

  useEffect(() => {
    onCloseRef.current = onClose;
    pendingRef.current = pending;
  });

  /** 年份下拉可选项：从起点年到「当前年与所选年中的较大者」 */
  const yearOptions = useMemo<SelectOption[]>(() => {
    const options: SelectOption[] = [];
    const last = Math.max(currentWeek.year, year, customYear);
    for (let y = START_YEAR; y <= last; y += 1) {
      options.push({ value: String(y), label: `${y} 年` });
    }
    return options;
  }, [currentWeek.year, year, customYear]);

  /** 自定义范围的周次可选项：上限取该年实际周数，2025 年只有 52 周 */
  const weekOptions = useMemo<SelectOption[]>(() => {
    const total = Math.min(MAX_WEEK, getWeekCount(customYear));
    const options: SelectOption[] = [];
    for (let w = 1; w <= total; w += 1) {
      options.push({ value: String(w), label: `第 ${w} 周` });
    }
    return options;
  }, [customYear]);

  /** 当前范围覆盖的周次，也就是将要提交给服务端的区间 */
  const weeks = useMemo<WeekRef[]>(() => {
    if (scope === 'year') return listWeeksOfYear(year);
    if (scope === 'recent3') return listWeeksInRecentMonths(3);
    if (scope === 'recent6') return listWeeksInRecentMonths(6);
    return listWeeksInRange(customYear, fromWeek, toWeek);
  }, [scope, year, customYear, fromWeek, toWeek]);

  /** 范围摘要：区间两端 + 覆盖周数，让用户在导出前就能核对范围 */
  const summary = useMemo((): string => {
    const first = weeks[0];
    const last = weeks[weeks.length - 1];
    if (first === undefined || last === undefined) return '该范围内没有可导出的周';
    return `${formatWeekLabel(first.year, first.week)} ~ ${formatWeekLabel(last.year, last.week)}（共 ${weeks.length} 周）`;
  }, [weeks]);

  // 弹窗打开时锁定页面滚动，关闭后还原
  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // 键盘交互：Esc 关闭（导出中不响应），Tab 在弹窗内循环；打开后焦点落在第一个范围选项上
  useEffect(() => {
    if (!open) return undefined;

    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    firstScopeRef.current?.focus();

    /**
     * 处理弹窗内的键盘事件
     * @param event - 键盘事件
     * @returns 无
     */
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!pendingRef.current) onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      /*
       * 只把「选中的单选钮」算进可聚焦元素：同一组 radio 里只有选中的那个参与 Tab 序列，
       * 若把 4 个都算进来，回绕时会聚焦到未选中的那个，键盘高亮位置与浏览器默认行为不一致。
       */
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'input[type="radio"]:checked:not(:disabled), button:not(:disabled)',
      );
      // 一个可聚焦元素都没有时拦下 Tab，否则焦点会逃到弹窗背后的页面上
      if (focusable === undefined || focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (first === undefined || last === undefined) return;

      // 只在首尾两端回绕，中间交给浏览器按默认顺序走
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, [open]);

  /**
   * 执行导出：拉取区间内的已写周报并合并为单个 Markdown 文件
   * @returns 无
   * @remarks 区间内一篇都没有时不下载空文件，改为在弹窗内就地提示，避免用户拿到一个只有标题的文件。
   */
  const handleExport = async (): Promise<void> => {
    const first = weeks[0];
    const last = weeks[weeks.length - 1];
    if (first === undefined || last === undefined) {
      setError('该范围内没有可导出的周');
      return;
    }

    setPending(true);
    setError('');
    try {
      const { items } = await fetchWeeklyExport(first, last);

      if (items.length === 0) {
        setError('该范围内还没有写过的周报，换个范围试试');
        setPending(false);
        return;
      }

      const monthsText = scope === 'recent3' ? '最近 3 个月' : '最近 6 个月';
      const title =
        scope === 'year' ? `${year} 年周报合集` : scope === 'custom' ? `${customYear} 年周报合集` : `${monthsText}周报合集`;

      // 文件名用纯 ASCII 的年份与周次，避免不同系统对中文文件名的处理差异
      const fileLabel =
        scope === 'year'
          ? String(year)
          : scope === 'custom'
            ? `${customYear}-W${fromWeek}-W${toWeek}`
            : `${first.year}W${first.week}-${last.year}W${last.week}`;

      downloadMarkdown(
        buildExportFileName(fileLabel),
        buildWeeklyMarkdown(items, {
          title,
          subtitle: `导出时间 ${dayjs().format('YYYY-MM-DD')} · 共 ${items.length} 篇`,
        }),
      );

      setPending(false);
      onExported(`已导出 ${items.length} 篇周报`);
      onClose();
    } catch (err) {
      setError(toErrorMessage(err, '导出失败，请稍后重试'));
      setPending(false);
    }
  };

  // 标题与说明的 id 需要稳定且唯一，分别供 aria-labelledby / aria-describedby 关联；
  // 必须在提前 return 之前调用
  const titleId = `${useId()}-title`;
  const descriptionId = `${useId()}-description`;
  const customOpen = scope === 'custom';

  if (!open) return null;

  return createPortal(
    <div
      className={styles.overlay}
      // 只有点在遮罩本身（而非弹窗内部）时才关闭；导出中不响应，避免请求在途时把弹窗关掉
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <h2 id={titleId} className={styles.title}>
          导出周报
        </h2>
        <p id={descriptionId} className={styles.description}>
          所选范围内的周报会合并为一个 Markdown 文件
        </p>

        <fieldset className={styles.scopeGroup} aria-label="导出范围">
          {SCOPE_OPTIONS.map((option, index) => (
            <label
              key={option.value}
              className={cx(
                styles.scopeOption,
                scope === option.value && styles.scopeOptionActive,
              )}
            >
              <input
                ref={index === 0 ? firstScopeRef : undefined}
                type="radio"
                name="export-scope"
                className={styles.radio}
                value={option.value}
                checked={scope === option.value}
                disabled={pending}
                onChange={() => {
                  setScope(option.value);
                  setError('');
                }}
              />
              <span className={styles.scopeLabel}>{option.label}</span>
              <span className={styles.scopeHint}>{option.hint}</span>
            </label>
          ))}
        </fieldset>

        {customOpen ? (
          <div className={styles.customRow}>
            <div className={styles.customField}>
              <span className={styles.customLabel}>年份</span>
              <Select
                value={String(customYear)}
                options={yearOptions}
                ariaLabel="选择导出年份"
                block
                panelZIndex="var(--z-modal-pop)"
                disabled={pending}
                onChange={(next) => {
                  const target = Number(next);
                  setCustomYear(target);
                  setFromWeek(1);
                  setToWeek(getWeekCount(target));
                  setError('');
                }}
              />
            </div>
            <div className={styles.customField}>
              <span className={styles.customLabel}>起始周</span>
              <Select
                value={String(fromWeek)}
                options={weekOptions}
                ariaLabel="选择起始周"
                block
                panelZIndex="var(--z-modal-pop)"
                disabled={pending}
                onChange={(next) => {
                  setFromWeek(Number(next));
                  setError('');
                }}
              />
            </div>
            <div className={styles.customField}>
              <span className={styles.customLabel}>结束周</span>
              <Select
                value={String(toWeek)}
                options={weekOptions}
                ariaLabel="选择结束周"
                block
                panelZIndex="var(--z-modal-pop)"
                disabled={pending}
                onChange={(next) => {
                  setToWeek(Number(next));
                  setError('');
                }}
              />
            </div>
          </div>
        ) : null}

        <p className={styles.summary}>{summary}</p>

        {/* role 让读屏即时播报导出失败与空范围 */}
        {error !== '' ? (
          <p className={styles.bannerError} role="alert">
            {error}
          </p>
        ) : null}

        <div className={styles.actions}>
          <button type="button" className={styles.cancel} disabled={pending} onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className={styles.confirm}
            disabled={pending || weeks.length === 0}
            onClick={() => void handleExport()}
          >
            {pending ? '导出中…' : '导出 Markdown'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ExportDialog;
