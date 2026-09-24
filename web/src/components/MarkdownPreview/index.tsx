/**
 * @component Markdown 预览
 * @description 把 Markdown 渲染为 React 元素；不使用 dangerouslySetInnerHTML（红线 2）
 * @author gouxinjie
 * @created 2026-09-18
 * @updated 2026-09-24
 */
import { useMemo } from 'react';
import type { RefObject } from 'react';
import { cx } from '@/utils/classNames';
import { renderMarkdown } from '@/utils/markdown';
import styles from './index.module.scss';

/** MarkdownPreview 属性 */
interface MarkdownPreviewProps {
  /** Markdown 原文 */
  source: string;
  /** 滚动容器引用，用于编辑 / 预览切换时保留滚动位置 */
  scrollRef?: RefObject<HTMLDivElement | null>;
  /** 空内容时的提示文案，默认「这周还没写」 */
  emptyHint?: string;
  /**
   * 是否保留单个换行，默认 false（标准 Markdown：单换行只是空格）
   * @remarks 便签是「一行一条」的随手记，靠它保留换行；周报正文保持标准语义
   */
  breaks?: boolean;
  /**
   * 追加到预览容器上的类名，供调用方微调内边距等
   * @remarks 容器默认取「周报编辑区」口径的内边距；便签预览弹窗里的留白与之不同，
   * 通过这个口子传入自己的类覆盖（用两段选择器提高特异性，避免与默认值打架）
   */
  className?: string;
}

/**
 * Markdown 预览
 * @param props - 见 MarkdownPreviewProps
 * @returns 渲染后的节点
 */
const MarkdownPreview = ({
  source,
  scrollRef,
  emptyHint = '这周还没写',
  breaks = false,
  className,
}: MarkdownPreviewProps) => {
  // 只在原文变化时重新解析，避免输入过程中的无谓解析
  const nodes = useMemo(() => renderMarkdown(source, breaks), [source, breaks]);

  return (
    <div className={cx(styles.preview, className)} ref={scrollRef}>
      {source.trim() === '' ? <p className={styles.empty}>{emptyHint}</p> : nodes}
    </div>
  );
};

export default MarkdownPreview;
