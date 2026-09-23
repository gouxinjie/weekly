/**
 * @component 编辑工具条
 * @description 编辑区上方的格式工具栏；除 Markdown 原生格式外，还提供段落格式下拉、
 * 文字颜色与背景颜色（分别以 <span style="color"> 与 <span style="background-color">
 * 形式无损保存在 Markdown 中）、渐变文字与附件入口（暂未开放）。
 * 图标统一用线性 SVG，避免 emoji 在不同系统下字形与颜色不一致
 * @author gouxinjie
 * @created 2026-09-18
 * @updated 2026-09-23
 */
import type { Editor } from '@tiptap/core';
import Select from '@/components/Select';
import type { SelectOption } from '@/components/Select';
import ToolbarColorMenu from './ToolbarColorMenu';
import { Icon, ToolButton } from './ToolbarButton';
import styles from './index.module.scss';

/** 段落格式下拉的可选项：正文 + 六级标题 */
const HEADING_OPTIONS: SelectOption[] = [
  { value: 'paragraph', label: '正文' },
  { value: 'h1', label: '一级标题' },
  { value: 'h2', label: '二级标题' },
  { value: 'h3', label: '三级标题' },
  { value: 'h4', label: '四级标题' },
  { value: 'h5', label: '五级标题' },
  { value: 'h6', label: '六级标题' },
];

/** 标题层级联合类型（与 TipTap 的 heading 层级一致） */
type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

/** 段落格式取值到标题层级的映射：null 表示正文 */
const HEADING_LEVELS: Record<string, HeadingLevel | null> = {
  paragraph: null,
  h1: 1,
  h2: 2,
  h3: 3,
  h4: 4,
  h5: 5,
  h6: 6,
};

/** 渐变预设（左→右两段式，与序列化白名单保持一致） */
const GRADIENTS: string[] = [
  'linear-gradient(90deg, #38bdf8, #2563eb)',
  'linear-gradient(90deg, #c084fc, #f472b6)',
  'linear-gradient(90deg, #818cf8, #a855f7)',
  'linear-gradient(90deg, #f87171, #fb923c)',
  'linear-gradient(90deg, #fbbf24, #f97316)',
];

/**
 * 把 rgb(r, g, b) 形式规范化成 #rrggbb，便于与色板比对选中态
 * @param value - 颜色值
 * @returns 规范化后的小写十六进制颜色；无法解析时原样小写返回
 */
const normalizeColor = (value: string): string => {
  const rgb = value.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/);
  if (rgb === null) return value.toLowerCase();
  const [r, g, b] = [rgb[1], rgb[2], rgb[3]].map(Number);
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
};

/**
 * 规范化渐变值：rgb() 色段转十六进制、压缩空白，便于与预设比对选中态
 * @param value - 渐变值
 * @returns 规范化后的渐变值
 */
const normalizeGradient = (value: string): string =>
  value.replace(/rgba?\([^)]+\)/g, (m) => normalizeColor(m)).replace(/\s+/g, ' ');

/**
 * 判断颜色值是否为透明态（等价于未设置）
 * @param value - 颜色值
 * @returns 透明时返回 true
 */
const isTransparentColor = (value: unknown): boolean =>
  typeof value !== 'string' ||
  value === '' ||
  value === 'transparent' ||
  /^rgba?\([^)]*,\s*0\s*\)$/.test(value);

/**
 * 取出颜色属性的规范化十六进制值
 * @param value - textStyle 标记上的属性值
 * @returns 未设置或透明时返回 null
 */
const toHexOrNull = (value: unknown): string | null =>
  isTransparentColor(value) ? null : normalizeColor(value as string);



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

  /** textStyle 标记上的属性集合：color / backgroundColor / gradient */
  const textStyleAttrs = editor?.getAttributes('textStyle');

  /** 当前文字颜色（透明色为渐变文字所用，视为未设置） */
  const currentColorHex = toHexOrNull(textStyleAttrs?.color);

  /** 当前背景颜色 */
  const currentBgHex = toHexOrNull(textStyleAttrs?.backgroundColor);

  /** 当前渐变（规范化后用于与预设比对） */
  const gradientAttr = textStyleAttrs?.gradient;
  const currentGradient =
    typeof gradientAttr === 'string' ? normalizeGradient(gradientAttr) : null;

  /** 段落格式下拉的当前值：光标所在标题层级，非标题时为正文 */
  const activeHeadingLevel = ([1, 2, 3, 4, 5, 6] as const).find((level) =>
    isActive('heading', { level }),
  );
  const headingValue = activeHeadingLevel === undefined ? 'paragraph' : `h${activeHeadingLevel}`;

  /**
   * 应用段落格式
   * @param value - 下拉取值（paragraph 表示正文，h1~h6 表示标题层级）
   * @returns 无
   */
  const applyHeading = (value: string): void => {
    if (editor === null) return;

    const level = HEADING_LEVELS[value];
    if (level === undefined) return;

    if (level === null) {
      editor.chain().focus().setParagraph().run();
      return;
    }
    editor.chain().focus().setHeading({ level }).run();
  };

  /**
   * 设置或清除文字颜色
   * @param color - 颜色值，null 表示恢复默认
   * @returns 无
   */
  const applyColor = (color: string | null): void => {
    if (editor === null) return;
    if (color === null) {
      editor.chain().focus().unsetColor().run();
    } else {
      editor.chain().focus().setColor(color).run();
    }
  };

  /**
   * 设置或清除背景颜色（与文字颜色相互独立，可同时存在）
   * @param color - 颜色值，null 表示恢复默认
   * @returns 无
   */
  const applyBackgroundColor = (color: string | null): void => {
    if (editor === null) return;
    if (color === null) {
      editor.chain().focus().unsetBackgroundColor().run();
    } else {
      editor.chain().focus().setBackgroundColor(color).run();
    }
  };

  /**
   * 设置渐变文字（与纯色互斥，setGradient 内部会清掉纯色）
   * @param gradient - 渐变值
   * @returns 无
   */
  const applyGradient = (gradient: string): void => {
    if (editor === null) return;
    editor.chain().focus().setGradient(gradient).run();
  };

  /**
   * 清除颜色与渐变，恢复默认文字（背景色由背景颜色下拉单独清除）
   * @returns 无
   */
  const clearDecoration = (): void => {
    if (editor === null) return;
    editor.chain().focus().unsetColor().unsetGradient().run();
  };

  /**
   * 文字颜色下拉的取值回调：选「默认」时同时清掉纯色与渐变
   * @param color - 颜色值；null 表示默认
   * @returns 无
   */
  const pickTextColor = (color: string | null): void => {
    if (color === null) {
      clearDecoration();
      return;
    }
    applyColor(color);
  };

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
        <ToolButton
          label={
            <Icon>
              <path d="M9 14 4 9l5-5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 9h9a7 7 0 0 1 0 14h-1" strokeLinecap="round" />
            </Icon>
          }
          title="撤销"
          onClick={() => editor?.chain().focus().undo().run()}
          disabled={disabled}
        />
        <ToolButton
          label={
            <Icon>
              <path d="m15 14 5-5-5-5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M20 9h-9a7 7 0 0 0 0 14h1" strokeLinecap="round" />
            </Icon>
          }
          title="重做"
          onClick={() => editor?.chain().focus().redo().run()}
          disabled={disabled}
        />
      </div>

      <div className={styles.group}>
        {/* 段落格式：标题层级用一个下拉承载，避免 H1~H6 六个按钮占据工具条 */}
        <Select
          value={headingValue}
          options={HEADING_OPTIONS}
          onChange={applyHeading}
          ariaLabel="段落格式"
          disabled={disabled}
          className={styles.headingSelect}
        />
      </div>

      <div className={styles.group}>
        <ToolButton
          label="B"
          title="加粗"
          active={isActive('bold')}
          onClick={() => editor?.chain().focus().toggleBold().run()}
          disabled={disabled}
        />
        <ToolButton
          label="I"
          title="斜体"
          active={isActive('italic')}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          disabled={disabled}
        />
        <ToolButton
          label="S"
          title="删除线"
          active={isActive('strike')}
          onClick={() => editor?.chain().focus().toggleStrike().run()}
          disabled={disabled}
        />
      </div>

      <div className={styles.group}>
        <ToolButton
          label={
            <Icon>
              <path d="M9 6h11M9 12h11M9 18h11" strokeLinecap="round" />
              <circle cx="4.6" cy="6" r="1.4" fill="currentColor" stroke="none" />
              <circle cx="4.6" cy="12" r="1.4" fill="currentColor" stroke="none" />
              <circle cx="4.6" cy="18" r="1.4" fill="currentColor" stroke="none" />
            </Icon>
          }
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
          label={
            <Icon>
              <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
              <path d="m8 12.2 2.4 2.4 5-5.2" strokeLinecap="round" strokeLinejoin="round" />
            </Icon>
          }
          title="待办列表"
          active={isActive('taskList')}
          onClick={() => editor?.chain().focus().toggleTaskList().run()}
          disabled={disabled}
        />
      </div>

      <div className={styles.group}>
        <ToolButton
          label={
            <Icon>
              <path d="M4 5.5h4.5a2.5 2.5 0 0 1 0 5H4v-5Z" />
              <path d="M4 10.5h5.5a2.5 2.5 0 0 1 0 5H4v-5Z" />
              <path d="M13 10.5h7M13 15.5h7" strokeLinecap="round" />
            </Icon>
          }
          title="引用"
          active={isActive('blockquote')}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          disabled={disabled}
        />
        <ToolButton
          label={
            <Icon>
              <path d="m9 8-4 4 4 4M15 8l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
            </Icon>
          }
          title="代码块"
          active={isActive('codeBlock')}
          onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
          disabled={disabled}
        />
        <ToolButton
          label={
            <Icon>
              <path d="M3.5 12h17" strokeLinecap="round" />
            </Icon>
          }
          title="分割线"
          onClick={() => editor?.chain().focus().setHorizontalRule().run()}
          disabled={disabled}
        />
        <ToolButton
          label={
            <Icon>
              <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
              <path d="M3.5 9.5h17M9.2 9.5v10M14.8 9.5v10" />
            </Icon>
          }
          title="插入表格"
          onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          disabled={disabled}
        />
      </div>

      <div className={styles.group}>
        <ToolButton
          label={
            <Icon>
              <path
                d="M10.6 13.4a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 0 0-5.7-5.7l-1.4 1.4"
                strokeLinecap="round"
              />
              <path
                d="M13.4 10.6a4 4 0 0 0-5.7 0l-2.8 2.8a4 4 0 0 0 5.7 5.7l1.4-1.4"
                strokeLinecap="round"
              />
            </Icon>
          }
          title="插入 / 取消链接"
          active={isActive('link')}
          onClick={toggleLink}
          disabled={disabled}
        />
      </div>

      <div className={styles.group}>
        {/* 文字颜色：字母 A + 底部当前色条 + 渐变分区 */}
        <ToolbarColorMenu
          trigger={
            <span className={styles.colorLabel}>
              A
              <span
                className={styles.colorUnderline}
                style={currentColorHex !== null ? { backgroundColor: currentColorHex } : undefined}
              />
            </span>
          }
          title="文字颜色"
          current={currentColorHex}
          onPick={pickTextColor}
          disabled={disabled}
          gradient={{ options: GRADIENTS, current: currentGradient, onPick: applyGradient }}
        />
        {/* 背景颜色：荧光笔图标 + 底部当前背景色条，与文字颜色相互独立 */}
        <ToolbarColorMenu
          trigger={
            <span className={styles.colorLabel}>
              <Icon>
                <path d="m9 11-6 6v3h9l3-3" strokeLinecap="round" strokeLinejoin="round" />
                <path
                  d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Icon>
              <span
                className={
                  currentBgHex === null
                    ? `${styles.colorUnderline} ${styles.bgBarEmpty}`
                    : styles.colorUnderline
                }
                style={currentBgHex !== null ? { backgroundColor: currentBgHex } : undefined}
              />
            </span>
          }
          title="背景颜色"
          current={currentBgHex}
          onPick={applyBackgroundColor}
          disabled={disabled}
          emptyDefault
        />
      </div>

      <div className={styles.group}>
        <ToolButton
          label={
            <Icon>
              <path
                d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Icon>
          }
          title="上传附件"
          onClick={() => window.alert('附件上传功能暂未开放，敬请期待')}
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
