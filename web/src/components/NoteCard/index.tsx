/**
 * @component 便签卡片
 * @description 便签墙上的一张便签：顶部为标题（可省），卡内直接编辑 Markdown 原文、随输入自撑高度；
 * 长内容在卡内滚动看原文，「预览」按钮把渲染后的成品交给预览弹窗；
 * 底部提供便签纸颜色、置顶、删除与该张便签自己的保存态
 * @author gouxinjie
 * @created 2026-09-23
 * @updated 2026-09-24
 */
import { memo, useEffect, useLayoutEffect, useRef } from 'react';
import { NOTE_COLORS, NOTE_TITLE_MAX_CHARS } from '@/constants';
import { formatDateShort } from '@/utils/format';
import type { UpdateNoteBody } from '@/types/api';
import type { Note, NoteColor, SaveState } from '@/types/models';
import styles from './index.module.scss';

/** 各保存状态的展示文案（与周报页口径一致） */
const SAVE_TEXT: Record<SaveState, string> = {
  idle: '',
  saving: '保存中',
  saved: '已保存',
  error: '保存失败',
};

/** 便签纸颜色 → 卡片样式类名映射（CSS Modules 不便动态拼接，显式映射） */
const CARD_COLOR_CLASS: Record<NoteColor, string> = {
  '': styles.colorDefault,
  yellow: styles.colorYellow,
  green: styles.colorGreen,
};

/** 便签纸颜色 → 纸色色块样式类名映射 */
const SWATCH_COLOR_CLASS: Record<NoteColor, string> = {
  '': styles.swatchDefault,
  yellow: styles.swatchYellow,
  green: styles.swatchGreen,
};

/** NoteCard 属性 */
interface NoteCardProps {
  /** 便签数据，内容受控于页面状态 */
  note: Note;
  /** 是否自动聚焦内容：本次新建的便签为 true */
  autoFocus: boolean;
  /**
   * 自动聚焦完成后的回调
   * @remarks 父级据此清掉「待聚焦」标记：否则该标记会一直挂着，
   * 卡片因搜索 / 筛选重新挂载时会再次抢走焦点
   */
  onAutoFocused: () => void;
  /** 标题 / 内容 / 颜色 / 置顶变化时的回调 */
  onChange: (note: Note, patch: Partial<UpdateNoteBody>) => void;
  /** 预览回调：打开预览弹窗，看 Markdown 渲染后的成品 */
  onPreview: (note: Note) => void;
  /** 删除回调 */
  onDelete: (note: Note) => void;
  /**
   * 丢弃回调：内容为空且未被特意保留（未置顶、未被改色）时移除这张便签
   * @remarks 只对本次会话新建的便签有意义，是否真的丢弃由页面判定
   */
  onDiscard: (note: Note) => void;
  /** 该张便签的保存状态 */
  saveState: SaveState;
}

/**
 * 便签卡片
 * @param props - 见 NoteCardProps
 * @returns 单张便签节点
 */
const NoteCard = ({
  note,
  autoFocus,
  onChange,
  onPreview,
  onDelete,
  onDiscard,
  onAutoFocused,
  saveState,
}: NoteCardProps) => {
  const textRef = useRef<HTMLTextAreaElement | null>(null);

  /*
   * 内容区高度跟随文本：高度先复位为 auto 再按 scrollHeight 撑开，
   * 否则删字时高度只增不减。超过上限由样式的 max-height 接管、转为卡内滚动。
   */
  useLayoutEffect(() => {
    const node = textRef.current;
    if (node === null) return;
    node.style.height = 'auto';
    node.style.height = `${node.scrollHeight}px`;
  }, [note.content]);

  // 新建后自动聚焦，并把光标落到已有内容的末尾；聚焦完立刻通知父级撤下标记
  useEffect(() => {
    if (!autoFocus) return;
    const node = textRef.current;
    if (node === null) return;
    node.focus();
    node.setSelectionRange(node.value.length, node.value.length);
    onAutoFocused();
  }, [autoFocus, onAutoFocused]);

  const colorClass = CARD_COLOR_CLASS[note.color];
  const saveText = SAVE_TEXT[saveState];
  const updatedLabel = formatDateShort(note.updatedAt);

  return (
    <article
      className={`${styles.card} ${colorClass} ${note.pinned ? styles.cardPinned : ''}`}
      // 焦点离开整张卡片时才判定丢弃：点击卡内的颜色 / 置顶 / 删除不应触发
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        onDiscard(note);
      }}
    >
      {/* 标题行：左侧标题输入（可省），右侧预览入口 */}
      <div className={styles.head}>
        <input
          className={styles.title}
          value={note.title}
          placeholder="标题（可省）"
          maxLength={NOTE_TITLE_MAX_CHARS}
          aria-label="便签标题"
          onChange={(event) => onChange(note, { title: event.target.value })}
        />

        {/* 空白便签没有可渲染的内容，按钮禁用而不是藏起来：位置固定，长内容时才找得到 */}
        <button
          type="button"
          className={styles.previewButton}
          disabled={note.content.trim() === ''}
          aria-label="预览便签（Markdown 渲染）"
          title="预览"
          onClick={() => onPreview(note)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path
              d="M2.7 12S6.4 6 12 6s9.3 6 9.3 6-3.7 6-9.3 6-9.3-6-9.3-6Z"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="12" r="2.9" />
          </svg>
        </button>
      </div>

      <textarea
        ref={textRef}
        className={styles.text}
        value={note.content}
        placeholder="随手记点什么，支持 Markdown…"
        // 多张便签在页面里是并列的，读屏时靠更新时间区分是哪一张
        aria-label={updatedLabel === '' ? '便签内容' : `便签内容（更新于 ${updatedLabel}）`}
        onChange={(event) => onChange(note, { content: event.target.value })}
      />

      <footer className={styles.footer}>
        <span className={styles.time}>{updatedLabel}</span>
        {saveText !== '' ? (
          <span
            className={saveState === 'error' ? styles.stateError : styles.state}
            aria-live="polite"
          >
            {saveText}
          </span>
        ) : null}

        <div className={styles.actions}>
          {/* 便签纸颜色：3 个色块，当前色内置对勾 + 主色描边 */}
          <div className={styles.colors}>
            {NOTE_COLORS.map((option) => {
              const value = option.value;
              const active = note.color === value;
              return (
                <button
                  key={option.value === '' ? 'default' : option.value}
                  type="button"
                  className={`${styles.swatch} ${SWATCH_COLOR_CLASS[value]} ${
                    active ? styles.swatchActive : ''
                  }`}
                  aria-label={option.label}
                  aria-pressed={active}
                  title={option.label}
                  onClick={() => onChange(note, { color: value })}
                >
                  {/* 当前色内置对勾：一行只有 3 个色块时，对勾比单靠描边更好认 */}
                  {active ? (
                    <svg
                      className={styles.swatchCheck}
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      aria-hidden
                    >
                      <path d="m3.4 8.6 3 3 6.2-6.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : null}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className={note.pinned ? `${styles.action} ${styles.actionActive}` : styles.action}
            aria-pressed={note.pinned}
            aria-label={note.pinned ? '取消置顶' : '置顶'}
            title={note.pinned ? '取消置顶' : '置顶'}
            onClick={() => onChange(note, { pinned: !note.pinned })}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
              <path d="M12 19.5V5" strokeLinecap="round" />
              <path d="m6.4 10.6 5.6-5.6 5.6 5.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {/* 删除：悬停转危险色（.actionDanger），与待办菜单里的删除项同一套危险语义 */}
          <button
            type="button"
            className={`${styles.action} ${styles.actionDanger}`}
            aria-label="删除便签"
            title="删除便签"
            onClick={() => onDelete(note)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
              <path d="M4.5 7h15" strokeLinecap="round" />
              <path d="M9.6 7V5.4h4.8V7" strokeLinejoin="round" />
              <path d="M6.6 7l.8 11.6h9.2L17.4 7" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </footer>
    </article>
  );
};

/**
 * 便签卡片：用 memo 包一层
 * 说明：便签墙是「输入即更新父级列表」的结构，一张便签打字会让整面墙重渲染；
 * 这里的 props 全部是稳定引用（note 对象只在该张便签变化时换新，三个回调都是 useCallback），
 * memo 因此能真正跳过其余卡片。
 */
export default memo(NoteCard);
