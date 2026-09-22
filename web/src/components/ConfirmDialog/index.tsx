/**
 * @component 二次确认弹窗
 * @description 敏感操作（修改密码、退出登录、退出所有设备）的二次确认层：
 * 通过 portal 渲染到 body 避免被抽屉 / 滚动容器裁剪，支持 Esc 与点击遮罩取消、
 * 打开时锁定页面滚动、焦点落在取消按钮上并在关闭后还原
 * @author gouxinjie
 * @created 2026-09-22
 * @updated 2026-09-22
 */
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import styles from './index.module.scss';

/** 弹窗语气：danger 用于不可逆操作，确认按钮取危险色 */
export type ConfirmTone = 'default' | 'danger';

/** ConfirmDialog 属性 */
interface ConfirmDialogProps {
  /** 是否展示，false 时完全不渲染 */
  open: boolean;
  /** 标题：一句话说清将要发生什么 */
  title: string;
  /** 补充说明：后果与影响范围，可为空 */
  description?: string;
  /** 确认按钮文案，默认「确定」 */
  confirmText?: string;
  /** 取消按钮文案，默认「取消」 */
  cancelText?: string;
  /** 语气，默认 default */
  tone?: ConfirmTone;
  /** 确认动作是否处理中，为 true 时两个按钮都禁用并显示「处理中…」 */
  pending?: boolean;
  /** 点击确认回调 */
  onConfirm: () => void;
  /** 取消 / 关闭回调 */
  onCancel: () => void;
}

/**
 * 拼接类名，过滤掉条件表达式产生的假值
 * @param names - 类名或假值
 * @returns 以空格连接的类名字符串
 */
const cx = (...names: (string | false | undefined)[]): string =>
  names.filter((name) => typeof name === 'string' && name !== '').join(' ');

/**
 * 二次确认弹窗
 * @param props - 见 ConfirmDialogProps
 * @returns 弹窗节点或 null
 */
const ConfirmDialog = ({
  open,
  title,
  description,
  confirmText = '确定',
  cancelText = '取消',
  tone = 'default',
  pending = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  // 用 ref 保存最新回调与处理中状态，避免它们变化时重建键盘监听、导致焦点被反复重置
  const onCancelRef = useRef(onCancel);
  const pendingRef = useRef(pending);

  useEffect(() => {
    onCancelRef.current = onCancel;
    pendingRef.current = pending;
  });

  // 弹窗打开时锁定页面滚动，关闭后还原
  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // 键盘交互：Esc 取消，Tab 在弹窗内循环
  useEffect(() => {
    if (!open) return undefined;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // 破坏性操作的默认焦点落在「取消」上，避免回车误触发
    cancelRef.current?.focus();

    /**
     * 处理弹窗内的键盘事件
     * @param event - 键盘事件
     * @returns 无
     */
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!pendingRef.current) onCancelRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled)');
      // 处理中两个按钮都被禁用，弹窗内没有任何可聚焦元素：
      // 此时必须拦下 Tab，否则焦点会逃到弹窗背后的页面上
      if (focusable === undefined || focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (first === undefined || last === undefined) return;

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

  // 标题与说明的 id 需要稳定且唯一，分别供 aria-labelledby / aria-describedby 关联；
  // 必须在提前 return 之前调用
  const titleId = `${useId()}-title`;
  const descriptionId = `${useId()}-description`;

  if (!open) return null;

  return createPortal(
    <div
      className={styles.overlay}
      // 只有点在遮罩本身（而非弹窗内部）时才关闭
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onCancel();
      }}
    >
      <div
        ref={panelRef}
        className={styles.panel}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description !== undefined ? descriptionId : undefined}
      >
        <span className={cx(styles.icon, tone === 'danger' && styles.iconDanger)} aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7.6v5.2" strokeLinecap="round" />
            <path d="M12 16.3h.01" strokeLinecap="round" />
          </svg>
        </span>

        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        {description !== undefined ? (
          <p id={descriptionId} className={styles.description}>
            {description}
          </p>
        ) : null}

        <div className={styles.actions}>
          <button
            ref={cancelRef}
            type="button"
            className={styles.cancel}
            disabled={pending}
            onClick={onCancel}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className={cx(styles.confirm, tone === 'danger' && styles.confirmDanger)}
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? '处理中…' : confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ConfirmDialog;
