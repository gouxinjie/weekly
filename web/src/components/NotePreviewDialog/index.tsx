/**
 * @component 便签预览弹窗
 * @description 把便签的 Markdown 原文渲染成成品，整屏铺开看全文：
 * 卡片里编辑的是 Markdown 源码，长内容在卡片里只能滚动看原文，预览入口负责「看效果」。
 * 通过 portal 渲染到 body，支持 Esc 与点击遮罩关闭、打开时锁定页面滚动、
 * 焦点落在关闭按钮上并在关闭后还原
 * @author gouxinjie
 * @created 2026-09-24
 * @updated 2026-09-24
 */
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import MarkdownPreview from '@/components/MarkdownPreview';
import styles from './index.module.scss';

/** NotePreviewDialog 属性 */
interface NotePreviewDialogProps {
  /** 是否展示，false 时完全不渲染 */
  open: boolean;
  /** 便签标题，空串表示无标题 */
  title: string;
  /** Markdown 原文 */
  content: string;
  /** 更新时间的展示文案，由页面侧格式化好 */
  updatedLabel: string;
  /** 关闭回调（Esc、遮罩、关闭按钮共用） */
  onClose: () => void;
}

/**
 * 便签预览弹窗
 * @param props - 见 NotePreviewDialogProps
 * @returns 弹窗节点或 null
 */
const NotePreviewDialog = ({
  open,
  title,
  content,
  updatedLabel,
  onClose,
}: NotePreviewDialogProps) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // 用 ref 保存最新回调，避免回调换引用时重建键盘监听、导致焦点被反复重置
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // 打开时锁定页面滚动，关闭后还原
  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // 键盘交互：Esc 关闭，Tab 在弹窗内循环
  useEffect(() => {
    if (!open) return undefined;

    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();

    /**
     * 处理弹窗内的键盘事件
     * @param event - 键盘事件
     * @returns 无
     */
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      // 正文里的链接也是可聚焦的：若只认关闭按钮，键盘用户按 Tab 会被永远锁在它身上
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not(:disabled), [tabindex]:not([tabindex="-1"])',
      );
      // 一个可聚焦元素都没有（内容为空）时拦下 Tab，否则焦点会逃到弹窗背后的页面上
      if (focusable === undefined || focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (first === undefined || last === undefined) return;

      // 只在首尾两端回绕，中间的元素交给浏览器按默认顺序走
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

  // 标题的 id 需要稳定且唯一，供 aria-labelledby 关联；连同下面的派生值一起放在提前 return 之前
  const titleId = `${useId()}-title`;
  /** 是否有真标题：没有时顶部显示占位名 */
  const hasTitle = title.trim() !== '';

  if (!open) return null;

  return createPortal(
    <div
      className={styles.overlay}
      // 只有点在遮罩本身（而非弹窗内部）时才关闭
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className={styles.header}>
          {/* 头部图标：给标题一个视觉锚点，一眼能认出这是「读便签」的层 */}
          <span className={styles.icon} aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path
                d="M6.6 3.8h6.9l4.5 4.5v11.4a.8.8 0 0 1-.8.8H6.6a.8.8 0 0 1-.8-.8V4.6a.8.8 0 0 1 .8-.8Z"
                strokeLinejoin="round"
              />
              <path d="M13.4 3.9v4.4h4.4" strokeLinejoin="round" />
              <path d="M8.8 12.6h6.4M8.8 15.8h4.4" strokeLinecap="round" />
            </svg>
          </span>

          <div className={styles.heading}>
            {/* 无标题的便签给一个占位名，弹窗顶部不至于空着一块 */}
            <h2 id={titleId} className={hasTitle ? styles.title : styles.titleEmpty}>
              {hasTitle ? title : '未命名便签'}
            </h2>
            {updatedLabel === '' ? null : (
              <span className={styles.time}>更新于 {updatedLabel}</span>
            )}
          </div>

          <button
            ref={closeRef}
            type="button"
            className={styles.close}
            aria-label="关闭预览"
            title="关闭预览"
            onClick={onClose}
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="m4.4 4.4 7.2 7.2M11.6 4.4 4.4 11.6" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        {/* 预览区：Markdown 渲染为 React 元素，不使用 dangerouslySetInnerHTML（红线 2）；
            便签多为「一行一条」，breaks 让单个换行也换行，不被合并成一段；
            className 用来把内边距换成弹窗口径（默认是周报编辑区那套） */}
        <MarkdownPreview
          source={content}
          emptyHint="这张便签还没有内容"
          breaks
          className={styles.body}
        />
      </div>
    </div>,
    document.body,
  );
};

export default NotePreviewDialog;
