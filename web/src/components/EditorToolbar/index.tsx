/**
 * @component 编辑工具条
 * @description 编辑区上方的格式工具栏；只提供 Markdown 能无损表达的格式（不做字号、颜色、对齐）
 * @author gouxinjie
 * @created 2026-09-18
 * @updated 2026-09-18
 */
import type { Editor } from '@tiptap/core';
import styles from './index.module.scss';

/** ToolButton 属性 */
interface ToolButtonProps {
  /** 按钮文案 */
  label: string;
  /** 悬停提示 */
  title: string;
  /** 是否处于激活态（高亮显示当前光标所在格式） */
  active?: boolean;
  /** 点击回调 */
  onClick: () => void;
  /** 是否禁用 */
  disabled?: boolean;
}

/**
 * 工具栏单个按钮
 * @param props - 见 ToolButtonProps
 * @returns 按钮节点
 */
const ToolButton = ({
  label,
  title,
  active = false,
  onClick,
  disabled = false,
}: ToolButtonProps) => (
  <button
    type="button"
    className={active ? `${styles.button} ${styles.active}` : styles.button}
    onClick={onClick}
    disabled={disabled}
    title={title}
  >
    {label}
  </button>
);

/** EditorToolbar 属性 */
interface EditorToolbarProps {
  /** TipTap 编辑器实例，尚未就绪时为 null */
  editor: Editor | null;
  /** 格式按钮是否禁用（预览模式下禁用，因为它们作用于编辑器） */
  formatDisabled: boolean;
  /** 导出 Markdown 文件 */
  onExport: () => void;
  /** 复制到剪贴板 */
  onCopy: () => void;
}

/**
 * 编辑工具条
 * @param props - 见 EditorToolbarProps
 * @returns 工具条节点
 */
const EditorToolbar = ({ editor, formatDisabled, onExport, onCopy }: EditorToolbarProps) => {
  /** 编辑器未就绪或处于预览模式时，所有作用于编辑器的按钮都不可用 */
  const disabled = formatDisabled || editor === null;

  /**
   * 判断某个格式是否处于激活态
   * @param name - 扩展名，如 bold / heading
   * @param attrs - 可选属性，如 { level: 3 }
   * @returns 是否激活
   */
  const isActive = (name: string, attrs?: Record<string, unknown>): boolean =>
    editor !== null && editor.isActive(name, attrs);

  /**
   * 插入或取消链接
   * @returns 无
   * @remarks 只接受 http / https 前缀，阻断 javascript: 等危险协议（红线 2 的链接防线）
   */
  const toggleLink = (): void => {
    if (editor === null) return;

    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run();
      return;
    }

    const input = window.prompt('输入链接地址（http:// 或 https://）', 'https://');
    if (input === null) return;

    const url = input.trim();
    if (url === '') return;

    if (!/^https?:\/\//i.test(url)) {
      window.alert('链接必须以 http:// 或 https:// 开头');
      return;
    }

    editor.chain().focus().setLink({ href: url }).run();
  };

  return (
    <div className={styles.toolbar}>
      <div className={styles.group}>
        <ToolButton label="↶" title="撤销" onClick={() => editor?.chain().focus().undo().run()} disabled={disabled} />
        <ToolButton label="↷" title="重做" onClick={() => editor?.chain().focus().redo().run()} disabled={disabled} />
      </div>

      <div className={styles.group}>
        <ToolButton
          label="H1"
          title="一级标题"
          active={isActive('heading', { level: 1 })}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
          disabled={disabled}
        />
        <ToolButton
          label="H2"
          title="二级标题"
          active={isActive('heading', { level: 2 })}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
          disabled={disabled}
        />
        <ToolButton
          label="H3"
          title="三级标题"
          active={isActive('heading', { level: 3 })}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
          disabled={disabled}
        />
      </div>

      <div className={styles.group}>
        <ToolButton label="B" title="加粗" active={isActive('bold')} onClick={() => editor?.chain().focus().toggleBold().run()} disabled={disabled} />
        <ToolButton label="I" title="斜体" active={isActive('italic')} onClick={() => editor?.chain().focus().toggleItalic().run()} disabled={disabled} />
        <ToolButton label="S" title="删除线" active={isActive('strike')} onClick={() => editor?.chain().focus().toggleStrike().run()} disabled={disabled} />
      </div>

      <div className={styles.group}>
        <ToolButton
          label="•"
          title="无序列表"
          active={isActive('bulletList')}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          disabled={disabled}
        />
        <ToolButton
          label="1."
          title="有序列表"
          active={isActive('orderedList')}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          disabled={disabled}
        />
        <ToolButton
          label="☑"
          title="待办列表"
          active={isActive('taskList')}
          onClick={() => editor?.chain().focus().toggleTaskList().run()}
          disabled={disabled}
        />
      </div>

      <div className={styles.group}>
        <ToolButton
          label="›"
          title="引用"
          active={isActive('blockquote')}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          disabled={disabled}
        />
        <ToolButton
          label={'</>'}
          title="代码块"
          active={isActive('codeBlock')}
          onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
          disabled={disabled}
        />
        <ToolButton
          label="—"
          title="分割线"
          onClick={() => editor?.chain().focus().setHorizontalRule().run()}
          disabled={disabled}
        />
        <ToolButton
          label="▦"
          title="插入表格"
          onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          disabled={disabled}
        />
      </div>

      <div className={styles.group}>
        <ToolButton
          label="🔗"
          title="插入 / 取消链接"
          active={isActive('link')}
          onClick={toggleLink}
          disabled={disabled}
        />
      </div>

      <div className={styles.group}>
        <ToolButton label="复制" title="复制 Markdown" onClick={onCopy} disabled={formatDisabled} />
        <ToolButton label="导出" title="导出 Markdown 文件" onClick={onExport} disabled={formatDisabled} />
      </div>
    </div>
  );
};

export default EditorToolbar;
