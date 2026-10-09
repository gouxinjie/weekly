/**
 * 周报导出工具
 * 说明：把一批周报合并成单个 Markdown 文档并触发下载。
 * 单周导出与批量导出共用这里的下载逻辑，避免两处各写一份 Blob / a.download 代码。
 */
import type { Weekly } from '@/types/models';
import { formatWeekLabel } from '@/utils/format';

/** 合并导出选项 */
export interface WeeklyMarkdownOptions {
  /** 文档标题，作为一级标题，如「2026 年周报合集」 */
  title: string;
  /** 标题下的补充说明，显示为引用行；缺省或空串时不输出 */
  subtitle?: string;
}

/**
 * 把多条周报合并为单个 Markdown 文档
 * @param items - 周报列表，服务端已按年、周升序返回
 * @param options - 标题等选项
 * @returns 可保存为 .md 的完整文本
 * @remarks 每周一节：二级标题写「ISO 年 + 周次（起止日期）」，正文原样拼接，节间用分隔线隔开。
 * 正文来自用户自己写的 Markdown 原文，不做转义、也不渲染成 HTML——
 * 导出的是 .md 源文件，不是网页，因此没有 XSS 面（红线 2 约束的是「渲染」，不是「落成文件」）。
 */
export const buildWeeklyMarkdown = (
  items: Weekly[],
  options: WeeklyMarkdownOptions,
): string => {
  const header =
    options.subtitle === undefined || options.subtitle === ''
      ? `# ${options.title}`
      : `# ${options.title}\n\n> ${options.subtitle}`;

  if (items.length === 0) return `${header}\n`;

  const body = items
    .map(
      (item) =>
        `## ${formatWeekLabel(item.year, item.week)}（${item.weekStart} ~ ${item.weekEnd}）\n\n${item.content.trim()}`,
    )
    .join('\n\n---\n\n');

  // 末尾统一补一个换行：多数 Markdown 解析器与 git diff 对「文件末缺少换行」会给出提示
  return `${header}\n\n${body}\n`;
};

/**
 * 触发浏览器下载一个 Markdown 文件
 * @param fileName - 文件名（需含 .md 扩展名）
 * @param markdown - 文件内容
 * @returns 无
 * @remarks 用 Blob + 临时 a 标签触发下载；对象 URL 在点击后立即释放，
 * 否则每导出一次就会在页面生命周期内多留一份文件内容在内存里。
 */
export const downloadMarkdown = (fileName: string, markdown: string): void => {
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * 构造导出文件名
 * @param label - 范围标识，如「2026」或「2026-W28-W41」
 * @returns 形如「weekly-2026.md」的文件名
 */
export const buildExportFileName = (label: string): string => `weekly-${label}.md`;
