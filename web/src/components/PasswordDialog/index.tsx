/**
 * @component 修改密码弹窗
 * @description 设置页「修改密码」的输入弹层：收集原密码、新密码与确认新密码，
 * 本地校验通过后再交给上层拉起二次确认。通过 portal 渲染到 body 避免被滚动容器裁剪，
 * 支持 Esc 与点击遮罩关闭、打开时锁定页面滚动、焦点落在首个输入框并在关闭后还原
 * @author gouxinjie
 * @created 2026-09-23
 * @updated 2026-09-23
 */
import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { createPortal } from 'react-dom';
import styles from './index.module.scss';

/** 密码强度：必须同时含数字与字母，长度不少于 6 位 */
const PASSWORD_PATTERN = /^(?=.*[0-9])(?=.*[a-zA-Z]).{6,}$/;

/** 表单内容：校验通过后交给上层，也用作重新打开时的回填初值 */
export interface PasswordFormValue {
  /** 原密码 */
  oldPassword: string;
  /** 新密码 */
  newPassword: string;
  /** 确认新密码 */
  confirmPassword: string;
}

/** PasswordDialog 属性 */
interface PasswordDialogProps {
  /** 是否展示，false 时完全不渲染 */
  open: boolean;
  /** 本地校验通过后的提交回调：由上层拉起二次确认 */
  onSubmit: (value: PasswordFormValue) => void;
  /** 打开时的回填初值，省略则三个输入框都为空 */
  initialValue?: PasswordFormValue;
  /** 关闭弹窗回调 */
  onCancel: () => void;
}

/**
 * 修改密码弹窗
 * @param props - 见 PasswordDialogProps
 * @returns 弹窗节点或 null
 */
const PasswordDialog = ({ open, onSubmit, initialValue, onCancel }: PasswordDialogProps) => {
  // 弹窗由上层条件渲染，每次打开都是新实例，初值只在挂载时取一次即可
  const [oldPassword, setOldPassword] = useState(initialValue?.oldPassword ?? '');
  const [newPassword, setNewPassword] = useState(initialValue?.newPassword ?? '');
  const [confirmPassword, setConfirmPassword] = useState(initialValue?.confirmPassword ?? '');
  const [error, setError] = useState('');

  const panelRef = useRef<HTMLDivElement | null>(null);
  const firstFieldRef = useRef<HTMLInputElement | null>(null);

  // 用 ref 保存最新回调，避免回调变化时重建键盘监听、导致焦点被反复重置
  const onCancelRef = useRef(onCancel);

  useEffect(() => {
    onCancelRef.current = onCancel;
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

  // 键盘交互：Esc 关闭，Tab 在弹窗内循环；打开后焦点落在第一个输入框
  useEffect(() => {
    if (!open) return undefined;

    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    firstFieldRef.current?.focus();

    /**
     * 处理弹窗内的键盘事件
     * @param event - 键盘事件
     * @returns 无
     */
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancelRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'input:not(:disabled), button:not(:disabled)',
      );
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

  /**
   * 提交表单：本地校验通过后才交给上层，失败只在弹窗内提示，不关闭弹窗
   * @param event - 表单提交事件
   * @returns 无
   */
  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();

    if (oldPassword === '') {
      setError('请输入原密码');
      return;
    }
    if (!PASSWORD_PATTERN.test(newPassword)) {
      setError('新密码需包含数字与字母，且长度不少于 6 位');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致');
      return;
    }

    setError('');
    onSubmit({ oldPassword, newPassword, confirmPassword });
  };

  if (!open) return null;

  return createPortal(
    <div
      className={styles.overlay}
      // 只有点在遮罩本身（而非弹窗内部）时才关闭
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
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
          修改密码
        </h2>
        <p id={descriptionId} className={styles.description}>
          需验证原密码，修改成功后其他设备会退出登录
        </p>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.field}>
            <span className={styles.label}>原密码</span>
            <input
              ref={firstFieldRef}
              className={styles.input}
              type="password"
              autoComplete="current-password"
              placeholder="请输入当前使用的密码"
              value={oldPassword}
              onChange={(event) => setOldPassword(event.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>新密码</span>
            <input
              className={styles.input}
              type="password"
              autoComplete="new-password"
              placeholder="数字 + 字母，不少于 6 位"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>确认新密码</span>
            <input
              className={styles.input}
              type="password"
              autoComplete="new-password"
              placeholder="请再次输入新密码"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </label>

          <p className={styles.hint}>密码需包含数字与字母，长度不少于 6 位</p>
          {/* role 让读屏即时播报校验失败 */}
          {error !== '' ? (
            <p className={styles.bannerError} role="alert">
              {error}
            </p>
          ) : null}

          <div className={styles.actions}>
            <button type="button" className={styles.cancel} onClick={onCancel}>
              取消
            </button>
            <button type="submit" className={styles.primary}>
              下一步
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};

export default PasswordDialog;
