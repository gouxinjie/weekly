/**
 * @component 编辑工具条
 * @description 编辑区上方的格式工具栏；除 Markdown 原生格式外，还提供文字颜色
 * （以 <span style="color"> 形式无损保存在 Markdown 中）与附件入口（暂未开放）。
 * 图标统一用线性 SVG，避免 emoji 在不同系统下字形与颜色不一致
 * @author gouxinjie
 * @created 2026-09-18
 * @updated 2026-09-23
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Editor } from '@tiptap/core';
import styles from './index.module.scss';

/** 图标属性：统一 24×24 视图的线性图标 */
interface IconProps {
  /** 图标路径（一个或多个 path / rect / circle） */
  children: ReactNode;
}

/**
 * 线性图标容器
 * @param props - 见 IconProps
 * @returns 图标节点
 */
const Icon = ({ children }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
    {children}
  </svg>
);

/** ToolButton 属性 */
interface ToolButtonProps {
  /** 按钮内容：文字或图标 */
  label: ReactNode;
  /** 悬停提示文案：渲染为自定义深底气泡，同时作为无障碍标签 */
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
 * @remarks 提示不用原生 title，而是写入 data-tip 由 CSS 气泡展示（见样式文件）
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
    data-tip={title}
    aria-label={title}
  >
    {label}
  </button>
);

/** 选中角标（对勾）：统一白色，配合投影保证任何底色上都清晰 */
const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
    <path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** 色板亮色列：红 橙 黄 黄绿 绿 青 蓝 靛 紫 品红 */
const BRIGHT_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#84cc16', '#10b981',
  '#06b6d4', '#3b82f6', '#6366f1', '#a855f7', '#ec4899',
];

/**
 * 把十六进制颜色按比例与黑或白混合，生成色阶
 * @param hex - 基色（#rrggbb）
 * @param toWhite - true 向白混合，false 向黑混合
 * @param ratio - 混合比例（0-1）
 * @returns 混合后的十六进制颜色
 */
const mixColor = (hex: string, toWhite: boolean, ratio: number): string => {
  const n = hex.slice(1);
  const target = toWhite ? 255 : 0;
  const channels = [0, 2, 4].map((i) => {
    const value = parseInt(n.slice(i, i + 2), 16);
    return Math.round(value + (target - value) * ratio);
  });
  return `#${channels.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
};

/** 色板：首行为灰阶；彩色行依次为亮色、浅、较浅、较深、深、最深 */
const PALETTE: string[][] = [
  [
    '#000000', '#262626', '#595959', '#8c8c8c', '#bfbfbf',
    '#d9d9d9', '#ececec', '#f5f5f5', '#fafafa', '#ffffff',
  ],
  BRIGHT_COLORS,
  BRIGHT_COLORS.map((color) => mixColor(color, true, 0.75)),
  BRIGHT_COLORS.map((color) => mixColor(color, true, 0.45)),
  BRIGHT_COLORS.map((color) => mixColor(color, false, 0.25)),
  BRIGHT_COLORS.map((color) => mixColor(color, false, 0.5)),
  BRIGHT_COLORS.map((color) => mixColor(color, false, 0.7)),
];

/** 渐变预设（左→右两段式，与序列化白名单保持一致） */
const GRADIENTS: string[] = [
  'linear-gradient(90deg, #38bdf8, #2563eb)',
  'linear-gradient(90deg, #c084fc, #f472b6)',
  'linear-gradient(90deg, #818cf8, #a855f7)',
  'linear-gradient(90deg, #f87171, #fb923c)',
  'linear-gradient(90deg, #fbbf24, #f97316)',
];

/** 颜色下拉菜单宽度（与样式中的定义保持一致） */
const COLOR_MENU_WIDTH = 260;

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

  /** 颜色下拉是否展开 */
  const [colorOpen, setColorOpen] = useState(false);
  /** 颜色下拉菜单的固定定位坐标（视口坐标，避免被祖先容器的 overflow 裁切） */
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  /** 颜色按钮容器引用：用于点击外部关闭与计算菜单位置 */
  const colorMenuRef = useRef<HTMLDivElement | null>(null);
  /** 颜色菜单本体引用：用于测量实际高度 */
  const colorMenuInnerRef = useRef<HTMLDivElement | null>(null);

  /**
   * 切换颜色下拉：展开时按按钮位置计算菜单坐标（贴按钮右缘向左展开）
   * @returns 无
   */
  const toggleColorMenu = (): void => {
    if (colorOpen) {
      setColorOpen(false);
      return;
    }
    const rect = colorMenuRef.current?.getBoundingClientRect();
    if (rect !== undefined) {
      setMenuPos({
        top: rect.bottom + 4,
        left: Math.max(8, rect.right - COLOR_MENU_WIDTH),
      });
    }
    setColorOpen(true);
  };

  // 下拉展开期间：点击菜单外部或按 Escape 关闭
  useEffect(() => {
    if (!colorOpen) return;

    const onPointerDown = (event: MouseEvent): void => {
      if (colorMenuRef.current !== null && !colorMenuRef.current.contains(event.target as Node)) {
        setColorOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setColorOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [colorOpen]);

  // 窗口尺寸变化或页面滚动时按钮位置失效，直接收起菜单
  // （scroll 不冒泡，用捕获阶段监听以覆盖编辑区等内部滚动容器）
  useEffect(() => {
    if (!colorOpen) return;

    const onResize = (): void => setColorOpen(false);
    const onScroll = (): void => setColorOpen(false);
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [colorOpen]);

  // 菜单展开后测量实际高度：放不下时向上翻，上下都放不下时贴视口顶部并内部滚动
  useLayoutEffect(() => {
    if (!colorOpen) return;
    const menuEl = colorMenuInnerRef.current;
    if (menuEl === null) return;

    const height = menuEl.offsetHeight;
    const viewportH = window.innerHeight;
    setMenuPos((prev) => {
      if (prev === null) return prev;
      if (prev.top + height <= viewportH - 8) return prev;

      const rect = colorMenuRef.current?.getBoundingClientRect();
      const flippedTop = (rect?.top ?? prev.top) - height - 4;
      return { ...prev, top: Math.max(8, flippedTop) };
    });
  }, [colorOpen]);

  /**
   * 判断某个格式是否处于激活态
   * @param name - 扩展名，如 bold / heading
   * @param attrs - 可选属性，如 { level: 3 }
   * @returns 是否激活
   */
  const isActive = (name: string, attrs?: Record<string, unknown>): boolean =>
    editor !== null && editor.isActive(name, attrs);

  /** 当前文字颜色（textStyle 标记上的 color 属性）；透明色（渐变文字所用）视为未设置 */
  const currentColor = editor?.getAttributes('textStyle').color;
  const currentColorHex =
    typeof currentColor === 'string' &&
    currentColor !== 'transparent' &&
    !/^rgba?\([^)]*,\s*0\s*\)$/.test(currentColor)
      ? normalizeColor(currentColor)
      : null;

  /** 当前渐变（textStyle 标记上的 gradient 属性），规范化后用于与预设比对 */
  const gradientAttr = editor?.getAttributes('textStyle').gradient;
  const currentGradient =
    typeof gradientAttr === 'string' ? normalizeGradient(gradientAttr) : null;

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
   * 设置渐变文字（与纯色互斥，setGradient 内部会清掉纯色）
   * @param gradient - 渐变值
   * @returns 无
   */
  const applyGradient = (gradient: string): void => {
    if (editor === null) return;
    editor.chain().focus().setGradient(gradient).run();
  };

  /**
   * 清除颜色与渐变，恢复默认文字
   * @returns 无
   */
  const clearDecoration = (): void => {
    if (editor === null) return;
    editor.chain().focus().unsetColor().unsetGradient().run();
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

  /** 单个色块：点选后应用颜色并收起菜单（取色器不受影响，保持展开便于连续调整） */
  const renderSwatch = (color: string, onPick: (c: string) => void, title: string) => {
    const selected = currentColorHex === color.toLowerCase();
    return (
      <button
        key={color}
        type="button"
        className={selected ? `${styles.swatch} ${styles.swatchActive}` : styles.swatch}
        style={{ backgroundColor: color }}
        title={title}
        aria-label={`${title}（${color}）`}
        aria-pressed={selected}
        onClick={() => {
          onPick(color);
          setColorOpen(false);
        }}
      >
        {selected ? <CheckIcon /> : null}
      </button>
    );
  };

  /** 单个渐变块：点选后应用渐变并收起菜单 */
  const renderGradientSwatch = (gradient: string) => {
    const selected = currentGradient === gradient;
    return (
      <button
        key={gradient}
        type="button"
        className={
          selected ? `${styles.gradientSwatch} ${styles.swatchActive}` : styles.gradientSwatch
        }
        style={{ backgroundImage: gradient }}
        title="渐变文字"
        aria-label={`渐变文字 ${gradient}`}
        aria-pressed={selected}
        onClick={() => {
          applyGradient(gradient);
          setColorOpen(false);
        }}
      >
        {selected ? <CheckIcon /> : null}
      </button>
    );
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
        {/* 文字颜色：按钮 + 下拉色板，容器相对定位供菜单绝对定位 */}
        <div className={styles.colorWrap} ref={colorMenuRef}>
          <ToolButton
            label={
              <span className={styles.colorLabel}>
                A
                <span
                  className={styles.colorUnderline}
                  style={currentColorHex !== null ? { backgroundColor: currentColorHex } : undefined}
                />
              </span>
            }
            title="文字颜色"
            active={colorOpen}
            onClick={toggleColorMenu}
            disabled={disabled}
          />
          {colorOpen ? (
            <div
              ref={colorMenuInnerRef}
              className={styles.colorMenu}
              style={{ top: menuPos?.top, left: menuPos?.left }}
              aria-label="文字颜色"
            >
              {/* 默认行：清除颜色与渐变 */}
              <div className={styles.menuRow}>
                <button
                  type="button"
                  className={styles.defaultSwatch}
                  title="默认"
                  aria-label="默认（无颜色）"
                  aria-pressed={currentColorHex === null && currentGradient === null}
                  onClick={() => {
                    clearDecoration();
                    setColorOpen(false);
                  }}
                >
                  {currentColorHex === null && currentGradient === null ? <CheckIcon /> : null}
                </button>
                <span className={styles.defaultLabel}>默认</span>
              </div>
              {/* 色板：灰阶 + 亮色行 + 由浅到深色阶 */}
              <div className={styles.palette}>
                {PALETTE.flat().map((color) => renderSwatch(color, applyColor, '文字颜色'))}
              </div>
              {/* 渐变色 */}
              <div className={styles.menuTitle}>渐变色</div>
              <div className={styles.menuRow}>
                {GRADIENTS.map((gradient) => renderGradientSwatch(gradient))}
              </div>
            </div>
          ) : null}
        </div>
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
