/**
 * @component Markdown 预览
 * @description 把 Markdown 渲染为 React 元素；不使用 dangerouslySetInnerHTML（红线 2）
 * @author gouxinjie
 * @created 2026-09-18
 * @updated 2026-09-18
 */
import { useMemo } from 'react';
import type { RefObject } from 'react';
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
}: MarkdownPreviewProps) => {
  // 只在原文变化时重新解析，避免输入过程中的无谓解析
  const nodes = useMemo(() => renderMarkdown(source), [source]);

  return (
    <div className={styles.preview} ref={scrollRef}>
      {source.trim() === '' ? <p className={styles.empty}>{emptyHint}</p> : nodes}
    </div>
  );
};

export default MarkdownPreview;
