/**
 * textStyle 标记的 Markdown 序列化支持
 * 说明：@tiptap/markdown 默认没有 textStyle 标记的渲染处理器，带颜色/渐变的文本
 * 在「编辑器 → Markdown」序列化时样式会被静默丢弃。这里给 textStyle 标记补上：
 * - 颜色：序列化成 <span style="color:#xxx">…</span>，解析方向靠 TextStyle 自带的
 *   span[style] parseDOM 规则读回，构成完整往返；
 * - 渐变：以 gradient 全局属性挂在 textStyle 上，序列化成
 *   <span style="color:transparent;background-image:linear-gradient(90deg,…)">…</span>，
 *   解析方向从 background-image 读回。
 * 所有写入 style 的值都经过白名单校验，阻断样式注入。
 */
import { Color, TextStyle } from '@tiptap/extension-text-style';

/** renderMarkdown 收到的合成节点（只用到 attrs） */
interface MarkdownSyntheticNode {
  /** 节点属性；textStyle 标记时可能含 color / gradient */
  attrs?: { color?: string | null; gradient?: string | null } | null;
}

/** renderMarkdown 收到的渲染辅助函数 */
interface MarkdownRenderHelpers {
  /** 渲染子内容，返回一个占位符字符串 */
  renderChildren: () => string;
}

/** 颜色值片段（十六进制 / rgb() / rgba()），供各白名单复用 */
const COLOR_VALUE =
  '(?:#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}|rgba?\\(\\s*[\\d.]+(?:\\s*,\\s*[\\d.]+%?){2,3}\\s*\\))';

/** 颜色值白名单 */
const SAFE_COLOR = new RegExp(`^${COLOR_VALUE}$`);

/** 渐变白名单：仅允许水平两段式 linear-gradient，色段必须命中颜色白名单 */
const SAFE_GRADIENT = new RegExp(
  `^linear-gradient\\(\\s*90deg\\s*,\\s*${COLOR_VALUE}\\s*,\\s*${COLOR_VALUE}\\s*\\)$`,
);

declare module '@tiptap/core' {
  interface MarkConfig {
    /** Markdown 序列化处理器，由 @tiptap/markdown 在扩展注册时读取 */
    renderMarkdown?: (
      node: MarkdownSyntheticNode,
      helpers: MarkdownRenderHelpers,
    ) => string;
  }
  interface Commands<ReturnType> {
    /** 独立命名空间键：不能与 @tiptap/extension-text-style 已声明的 textStyle 键合并 */
    weeklyTextStyle: {
      /**
       * 给选中文本设置渐变色（同时清除纯色）
       * @param gradient - 渐变值，须命中 SAFE_GRADIENT 白名单
       */
      setGradient: (gradient: string) => ReturnType;
      /** 清除选中文本的渐变色 */
      unsetGradient: () => ReturnType;
    };
  }
}

/** 支持 Markdown 序列化的 TextStyle 标记（替代原版注册进编辑器） */
export const TextStyleWithMarkdown = TextStyle.extend({
  /**
   * 渐变属性：挂在 textStyle 标记上，渲染为 background-clip: text 的渐变文字
   */
  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          gradient: {
            /** 无渐变时为 null */
            default: null,
            /**
             * 从 DOM style 读回渐变
             * @param element - 被解析的元素
             * @returns 命中白名单时返回规范化后的渐变值，否则 null
             */
            parseHTML: (element: HTMLElement) => {
              const raw = element.style.backgroundImage;
              if (typeof raw !== 'string' || raw === '' || raw === 'none') return null;
              const value = raw.replace(/\s+/g, ' ');
              return SAFE_GRADIENT.test(value) ? value : null;
            },
            /**
             * 渲染为内联样式
             * @param attributes - 标记属性
             * @returns 命中白名单时返回渐变文字样式，否则空对象
             */
            renderHTML: (attributes: { gradient?: string | null }) => {
              const gradient = attributes.gradient;
              if (typeof gradient !== 'string' || !SAFE_GRADIENT.test(gradient)) return {};
              return {
                style: `color:transparent;background-image:${gradient};-webkit-background-clip:text;background-clip:text`,
              };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      /**
       * 设置渐变文字（同时清除纯色，两者互斥）
       * @param gradient - 渐变值
       * @returns 命令结果
       */
      setGradient:
        (gradient: string) =>
        ({ chain }) =>
          chain().setMark('textStyle', { gradient, color: null }).run(),
      /**
       * 清除渐变文字
       * @returns 命令结果
       */
      unsetGradient:
        () =>
        ({ chain }) =>
          chain().setMark('textStyle', { gradient: null }).removeEmptyTextStyle().run(),
    };
  },

  /**
   * 序列化为 Markdown
   * @param node - 合成节点，attrs 含 color / gradient
   * @param helpers - 渲染辅助函数
   * @returns 序列化结果：渐变优先，其次纯色，都没有时原样返回子内容
   */
  renderMarkdown(node, helpers) {
    const children = helpers.renderChildren();
    const gradient = node.attrs?.gradient;
    if (typeof gradient === 'string' && SAFE_GRADIENT.test(gradient)) {
      return `<span style="color:transparent;background-image:${gradient};-webkit-background-clip:text;background-clip:text">${children}</span>`;
    }

    const color = node.attrs?.color;
    if (typeof color !== 'string' || !SAFE_COLOR.test(color)) return children;
    return `<span style="color:${color}">${children}</span>`;
  },
});

/** 透明色形式（transparent 或 alpha 为 0 的 rgba），渐变文字往返时会出现 */
const TRANSPARENT_COLOR = /^(?:transparent|rgba?\(\s*0(?:\s*,\s*0){2}(?:\s*,\s*0)?\s*\))$/;

/** 解析透明色防护后的 Color 扩展（替代原版注册进编辑器） */
export const ColorWithTransparentReset = Color.extend({
  /**
   * 覆写 color 属性解析：渐变文字的 span 带 color:transparent，
   * 原版会把它解析成 rgba(0,0,0,0) 存进标记；渲染时与渐变的 style 互相覆盖，
   * 可能只剩透明色导致文字不可见。这里把透明色一律视为未设置颜色。
   */
  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          color: {
            /** 无颜色时为 null */
            default: null,
            /**
             * 从 DOM style 读回颜色，透明色返回 null
             * @param element - 被解析的元素
             * @returns 颜色值或 null
             */
            parseHTML: (element: HTMLElement) => {
              const raw = element.style.color;
              if (typeof raw !== 'string' || raw === '') return null;
              const value = raw.replace(/\s+/g, ' ');
              if (TRANSPARENT_COLOR.test(value)) return null;
              return SAFE_COLOR.test(value) ? value : null;
            },
            /**
             * 渲染为内联样式
             * @param attributes - 标记属性
             * @returns 命中白名单时返回颜色样式，否则空对象
             */
            renderHTML: (attributes: { color?: string | null }) => {
              const color = attributes.color;
              if (typeof color !== 'string' || !SAFE_COLOR.test(color)) return {};
              return { style: `color:${color}` };
            },
          },
        },
      },
    ];
  },
});
