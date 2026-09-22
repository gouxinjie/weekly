/**
 * @component 编辑辅助面板
 * @description 右栏抽屉（周报编辑态）：模板应用、快速插入常用段落、导出为 Markdown / 打印为 PDF
 * @author gouxinjie
 * @created 2026-09-20
 * @updated 2026-09-22
 */
import { useState } from 'react';
import type { Editor } from '@tiptap/core';
import Select from '@/components/Select';
import type { SelectOption } from '@/components/Select';
import { WEEKLY_TEMPLATE } from '@/constants';
import styles from './index.module.scss';

/** 快速插入的段落定义 */
interface InsertOption {
  /** 展示文案 */
  label: string;
  /** 插入的 Markdown 标题文本 */
  heading: string;
}

/** 模板下拉的可选项 */
const TEMPLATE_OPTIONS: SelectOption[] = [
  { value: 'weekly', label: '周报模板' },
  { value: 'blank', label: '空白' },
];

/** 快速插入的四个常用段落 */
const INSERT_OPTIONS: InsertOption[] = [
  { label: '本周总结', heading: '本周总结' },
  { label: '遇到的问题', heading: '遇到的问题' },
  { label: '下周计划', heading: '下周计划' },
  { label: '工作收获', heading: '工作收获' },
];

/** 行首的加号图标：快速插入用 */
const PlusIcon = () => (
  <svg className={styles.rowIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
    <circle cx="12" cy="12" r="8.4" />
    <path d="M12 8.4v7.2M8.4 12h7.2" strokeLinecap="round" />
  </svg>
);

/** 行首的文档图标：导出用 */
const DocIcon = () => (
  <svg className={styles.rowIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
    <path d="M13.5 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9l-5.5-5.5Z" strokeLinejoin="round" />
    <path d="M13.5 3.5V9H19" strokeLinejoin="round" />
  </svg>
);

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
        <Select
          value={templateKey}
          options={TEMPLATE_OPTIONS}
          ariaLabel="选择模板"
          block
          onChange={setTemplateKey}
        />
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
        <ul className={styles.list}>
          {INSERT_OPTIONS.map((option) => (
            <li key={option.label}>
              <button
                type="button"
                className={styles.rowButton}
                onClick={() => insertHeading(option.heading)}
                disabled={editor === null}
              >
                <PlusIcon />
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* 导出 */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>导出</h3>
        <ul className={styles.list}>
          <li>
            <button type="button" className={styles.rowButton} onClick={onExport}>
              <DocIcon />
              导出为 Markdown
            </button>
          </li>
          <li>
            <button
              type="button"
              className={styles.rowButton}
              onClick={() => window.print()}
              title="调起浏览器打印，可选择「另存为 PDF」"
            >
              <DocIcon />
              导出为 PDF
            </button>
          </li>
        </ul>
      </section>
    </div>
  );
};

export default EditorPanel;
