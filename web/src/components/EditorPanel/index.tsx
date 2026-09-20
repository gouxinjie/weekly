/**
 * @component 编辑辅助面板
 * @description 右栏抽屉（周报编辑态）：模板应用、快速插入常用段落、导出为 Markdown / 打印为 PDF
 * @author gouxinjie
 * @created 2026-09-20
 * @updated 2026-09-20
 */
import { useState } from 'react';
import type { Editor } from '@tiptap/core';
import { WEEKLY_TEMPLATE } from '@/constants';
import styles from './index.module.scss';

/** 快速插入的段落定义 */
interface InsertOption {
  /** 展示文案 */
  label: string;
  /** 插入的 Markdown 标题文本 */
  heading: string;
}

/** 快速插入的四个常用段落 */
const INSERT_OPTIONS: InsertOption[] = [
  { label: '本周总结', heading: '本周总结' },
  { label: '遇到的问题', heading: '遇到的问题' },
  { label: '下周计划', heading: '下周计划' },
  { label: '工作收获', heading: '工作收获' },
];

/** EditorPanel 属性 */
interface EditorPanelProps {
  /** TipTap 编辑器实例，尚未就绪时为 null */
  editor: Editor | null;
  /** 应用模板（覆盖当前内容），由页面实现并给出确认 */
  onApplyTemplate: (template: string) => void;
  /** 导出 Markdown 文件 */
  onExport: () => void;
}

/**
 * 编辑辅助面板
 * @param props - 见 EditorPanelProps
 * @returns 右栏内容节点
 */
const EditorPanel = ({ editor, onApplyTemplate, onExport }: EditorPanelProps) => {
  const [templateKey, setTemplateKey] = useState('weekly');

  /**
   * 在光标处插入一个二级标题段落
   * @param heading - 标题文本
   * @returns 无
   */
  const insertHeading = (heading: string): void => {
    editor?.chain().focus().insertContent(`## ${heading}\n`).run();
  };

  return (
    <div className={styles.panel}>
      {/* 模板：选择模板并覆盖应用 */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>模板</h3>
        <select
          className={styles.select}
          value={templateKey}
          onChange={(event) => setTemplateKey(event.target.value)}
        >
          <option value="weekly">周报模板</option>
          <option value="blank">空白</option>
        </select>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() =>
            onApplyTemplate(templateKey === 'weekly' ? WEEKLY_TEMPLATE : '')
          }
        >
          应用模板
        </button>
      </section>

      {/* 快速插入：光标处插入常用段落标题 */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>快速插入</h3>
        <ul className={styles.insertList}>
          {INSERT_OPTIONS.map((option) => (
            <li key={option.label}>
              <button
                type="button"
                className={styles.insertButton}
                onClick={() => insertHeading(option.heading)}
                disabled={editor === null}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* 导出 */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>导出</h3>
        <button type="button" className={styles.plainButton} onClick={onExport}>
          导出为 Markdown
        </button>
        <button
          type="button"
          className={styles.plainButton}
          onClick={() => window.print()}
          title="调起浏览器打印，可选择「另存为 PDF」"
        >
          导出为 PDF
        </button>
      </section>
    </div>
  );
};

export default EditorPanel;
