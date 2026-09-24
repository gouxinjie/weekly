/**
 * @component 新建便签弹窗
 * @description 便签墙「＋ 新建」的输入层：先在弹窗里写好标题与正文，再生成一张便签，
 * 不必先生成空白卡片、再进卡片里写。通过 portal 渲染到 body 避免被滚动容器裁剪，
 * 支持 Esc 与点击遮罩关闭、打开时锁定页面滚动、焦点落在标题输入框并在关闭后还原；
 * 创建失败时弹窗保持打开、已填内容不丢，只有创建成功才由页面侧关闭。
 * @author gouxinjie
 * @created 2026-09-24
 * @updated 2026-09-24
 */
import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { NOTE_TITLE_MAX_CHARS } from '@/constants';
import type { CreateNoteBody } from '@/types/api';
import styles from './index.module.scss';

/** NoteCreateDialog 属性 */
interface NoteCreateDialogProps {
  /** 是否展示，false 时完全不渲染 */
  open: boolean;
  /**
   * 创建请求是否在处理中
   * @remarks 为 true 时按钮禁用、主按钮文案转「创建中…」，且不再响应 Esc 与点击遮罩关闭，
   * 避免请求在途时弹窗被关掉、结果无处安放
   */
  pending: boolean;
  /**
   * 创建失败的原因
   * @remarks 由页面侧格式化好，空串表示无错误；非空时在弹窗内就地提示（role="alert"）
   */
  error: string;
  /** 点击「创建」的回调，入参为标题与正文，均为原始输入（不做裁剪，可都为空串） */
  onSubmit: (body: CreateNoteBody) => void;
  /** 取消 / 关闭回调（Esc、点击遮罩、取消按钮共用） */
  onCancel: () => void;
}

/**
 * 新建便签弹窗
 * @param props - 见 NoteCreateDialogProps
 * @returns 弹窗节点或 null
 */
const NoteCreateDialog = ({ open, pending, error, onSubmit, onCancel }: NoteCreateDialogProps) => {
  /*
   * 弹窗由上层条件渲染（createOpen 为真时才挂载），每次打开都是新实例，
   * 因此两个字段的空初值只在挂载时取一次即可，不必在 open 翻转时手动清空。
   */
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  const panelRef = useRef<HTMLDivElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const contentRef = useRef<HTMLTextAreaElement | null>(null);

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

  // 键盘交互：Esc 关闭（创建中不响应），Tab 在弹窗内循环；打开后焦点落在标题输入框
  useEffect(() => {
    if (!open) return undefined;

    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    titleRef.current?.focus();

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

      // 文本域也要算进可聚焦元素，否则 Tab 到正文后会被拦下，反而走不到按钮上
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'input:not(:disabled), textarea:not(:disabled), button:not(:disabled)',
      );
      // 一个可聚焦元素都没有时拦下 Tab，否则焦点会逃到弹窗背后的页面上
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

  /**
   * 处理表单内的键盘事件
   * @param event - 键盘事件
   * @returns 无
   * @remarks 回车一律不落到「浏览器的隐式提交」上，只走这里显式的两条分支。
   * Ctrl / ⌘ + Enter 直接创建（写了几行后手不必移到按钮上），
   * 走 requestSubmit 而不是直接调提交逻辑，与点按钮共用同一条路径（含表单校验）。
   */
  const handleFormKeyDown = (event: ReactKeyboardEvent<HTMLFormElement>): void => {
    if (event.key !== 'Enter') return;

    if (event.metaKey || event.ctrlKey) {
      event.preventDefault();
      // 创建中再按就忽略：不拦下默认行为的话，回车会走隐式提交再触发一次
      if (!pending) formRef.current?.requestSubmit();
      return;
    }

    /*
     * 标题里单按回车不提交，改为把光标送进正文：这里敲回车的意思通常是
     * 「标题写完了，接着写正文」，而浏览器的隐式提交会让它反直觉地把只有标题的便签建出去。
     * 正文里的回车不拦——那是换行。创建始终由 Ctrl / ⌘ + Enter 或「创建」按钮触发。
     */
    if (event.target === titleRef.current) {
      event.preventDefault();
      contentRef.current?.focus();
    }
  };

  /**
   * 提交表单：把标题与正文交给上层去创建
   * @param event - 表单提交事件
   * @returns 无
   * @remarks 不拦截「两个字段都为空」：便签允许空白存在，点「创建」即得到一张空白便签，
   * 它在卡片里写完前失焦会被页面丢弃，不在墙上留下空白卡片
   */
  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    onSubmit({ title, content });
  };

  // 标题与说明的 id 需要稳定且唯一，分别供 aria-labelledby / aria-describedby 关联；
  // 必须在提前 return 之前调用
  const titleId = `${useId()}-title`;
  const descriptionId = `${useId()}-description`;

  if (!open) return null;

  return createPortal(
    <div
      className={styles.overlay}
      // 只有点在遮罩本身（而非弹窗内部）时才关闭；创建中不响应，避免请求在途时把弹窗关掉
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onCancel();
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
          新建便签
        </h2>
        <p id={descriptionId} className={styles.description}>
          标题可省，正文支持 Markdown
        </p>

        <form
          ref={formRef}
          className={styles.form}
          onSubmit={handleSubmit}
          onKeyDown={handleFormKeyDown}
        >
          {/*
            创建中把两个字段锁成只读：请求带的是点「创建」那一刻的快照，
            这段时间再敲进去的字会随弹窗关闭一起丢掉，不如先不让改。
            用 readOnly 而不是 disabled——readOnly 不改外观、也不会把焦点从输入框上赶走
            （disabled 会让焦点跳走、输入框变灰闪一下）。
          */}
          <label className={styles.field}>
            <span className={styles.label}>标题</span>
            <input
              ref={titleRef}
              className={styles.input}
              value={title}
              maxLength={NOTE_TITLE_MAX_CHARS}
              placeholder="标题（可省）"
              readOnly={pending}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>正文</span>
            <textarea
              ref={contentRef}
              className={styles.textarea}
              value={content}
              placeholder="随手记点什么，支持 Markdown…"
              readOnly={pending}
              onChange={(event) => setContent(event.target.value)}
            />
          </label>

          <p className={styles.hint}>按 Ctrl / ⌘ + Enter 可直接创建</p>
          {/* role 让读屏即时播报创建失败 */}
          {error !== '' ? (
            <p className={styles.bannerError} role="alert">
              {error}
            </p>
          ) : null}

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.cancel}
              disabled={pending}
              onClick={onCancel}
            >
              取消
            </button>
            <button type="submit" className={styles.primary} disabled={pending}>
              {pending ? '创建中…' : '创建'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};

export default NoteCreateDialog;
