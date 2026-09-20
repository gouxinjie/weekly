import MarkdownIt from 'markdown-it';
import { createElement } from 'react';
import type { ReactNode } from 'react';

/**
 * Markdown 渲染工具
 * 说明：这里不使用 dangerouslySetInnerHTML（红线 2），
 * 而是把 markdown-it 解析出的 token 流映射成 React 元素，从根上杜绝 XSS。
 */

/**
 * markdown-it 实例
 * html 必须为 false：开启后用户内容里的原始 HTML 会被当作 HTML 执行，多用户环境下是存储型 XSS。
 */
const md = new MarkdownIt({ html: false, linkify: false, breaks: false, typographer: false });

/** markdown-it 实例类型（markdown-it 只导出了构造函数值，需要从值推导实例类型） */
type MarkdownItInstance = InstanceType<typeof MarkdownIt>;

/** 解析出的 token 类型（从实例方法推导，避免依赖 markdown-it 内部类型路径） */
type MdToken = ReturnType<MarkdownItInstance['parse']>[number];

/** 危险协议黑名单：命中后链接降级为不可点击，阻断 javascript: / data: 等 XSS 载体 */
const DANGEROUS_URL = /^\s*(?:javascript|data|vbscript|file)\s*:/i;

/**
 * 校验链接安全性
 * @param url - 原始链接
 * @returns 安全时返回原链接，否则返回占位符 '#'
 */
const safeUrl = (url: string): string => (DANGEROUS_URL.test(url) ? '#' : url);

/**
 * 读取 token 的属性值
 * @param token - markdown-it token
 * @param name - 属性名
 * @returns 属性值，不存在时返回空字符串
 */
const getAttr = (token: MdToken, name: string): string => {
  const list = token.attrs;
  if (list === null) return '';
  const found = list.find((item) => item[0] === name);
  // 属性值在类型上是 string | number，统一转成字符串
  return found === undefined ? '' : String(found[1]);
};

/** 行内开启 token 到 HTML 标签的映射 */
const INLINE_OPEN_TAG: Record<string, string> = {
  strong_open: 'strong',
  em_open: 'em',
  s_open: 's',
  link_open: 'a',
};

/** 行内嵌套栈帧 */
interface InlineFrame {
  /** HTML 标签名 */
  tag: string;
  /** 标签属性 */
  props: Record<string, string>;
  /** 子节点 */
  children: ReactNode[];
}

/**
 * 渲染行内 token 序列
 * @param tokens - inline token 的 children
 * @returns React 节点数组
 */
const renderInline = (tokens: MdToken[]): ReactNode[] => {
  const root: ReactNode[] = [];
  const stack: InlineFrame[] = [];
  let current: ReactNode[] = root;

  tokens.forEach((token, index) => {
    // token 序列是静态渲染，用「类型 + 下标」组合作为 key 已足够稳定
    const key = `${token.type}-${index}`;
    const openTag = INLINE_OPEN_TAG[token.type];

    if (openTag !== undefined) {
      const props: Record<string, string> = {};
      if (token.type === 'link_open') {
        props.href = safeUrl(getAttr(token, 'href'));
        props.target = '_blank';
        props.rel = 'noopener noreferrer';
      }
      stack.push({ tag: openTag, props, children: [] });
      current = stack[stack.length - 1].children;
      return;
    }

    if (token.type.endsWith('_close') && stack.length > 0) {
      const frame = stack.pop();
      if (frame !== undefined) {
        current = stack.length > 0 ? stack[stack.length - 1].children : root;
        current.push(createElement(frame.tag, { key, ...frame.props }, ...frame.children));
      }
      return;
    }

    switch (token.type) {
      case 'text':
        current.push(token.content);
        return;
      case 'code_inline':
        current.push(createElement('code', { key }, token.content));
        return;
      case 'softbreak':
        current.push(' ');
        return;
      case 'hardbreak':
        current.push(createElement('br', { key }));
        return;
      case 'image':
        current.push(
          createElement('img', {
            key,
            src: safeUrl(getAttr(token, 'src')),
            alt: token.content,
          }),
        );
        return;
      default:
        // html_inline 在 html: false 下不会产生；其余未知类型一律忽略，绝不原样输出
        return;
    }
  });

  // 兜底：出现未闭合标签时把子节点提升到上一层，避免内容丢失
  while (stack.length > 0) {
    const frame = stack.pop();
    if (frame === undefined) break;
    const parent = stack.length > 0 ? stack[stack.length - 1].children : root;
    parent.push(...frame.children);
  }

  return root;
};

/** 需要成对开闭的块级 token 映射 */
const BLOCK_TAG_MAP: Record<string, { tag: string; close: string }> = {
  bullet_list_open: { tag: 'ul', close: 'bullet_list_close' },
  ordered_list_open: { tag: 'ol', close: 'ordered_list_close' },
  list_item_open: { tag: 'li', close: 'list_item_close' },
  blockquote_open: { tag: 'blockquote', close: 'blockquote_close' },
  table_open: { tag: 'table', close: 'table_close' },
  thead_open: { tag: 'thead', close: 'thead_close' },
  tbody_open: { tag: 'tbody', close: 'tbody_close' },
  tr_open: { tag: 'tr', close: 'tr_close' },
};

/** 块级解析结果 */
interface BlockResult {
  /** 渲染出的节点 */
  nodes: ReactNode[];
  /** 下一个待处理下标 */
  next: number;
}

/**
 * 递归解析块级 token
 * @param tokens - 全部 token
 * @param start - 起始下标
 * @param stopType - 终止的闭合 token 类型，null 表示解析到结尾
 * @returns 渲染节点与下一个待处理下标
 */
const parseBlocks = (tokens: MdToken[], start: number, stopType: string | null): BlockResult => {
  const nodes: ReactNode[] = [];
  let i = start;

  while (i < tokens.length) {
    const token = tokens[i];

    if (stopType !== null && token.type === stopType) {
      return { nodes, next: i + 1 };
    }

    const key = `${token.type}-${i}`;
    const mapped = BLOCK_TAG_MAP[token.type];

    if (mapped !== undefined) {
      const inner = parseBlocks(tokens, i + 1, mapped.close);
      nodes.push(createElement(mapped.tag, { key }, ...inner.nodes));
      i = inner.next;
      continue;
    }

    switch (token.type) {
      case 'heading_open': {
        const inner = parseBlocks(tokens, i + 1, 'heading_close');
        nodes.push(createElement(token.tag, { key }, ...inner.nodes));
        i = inner.next;
        break;
      }
      case 'paragraph_open': {
        const inner = parseBlocks(tokens, i + 1, 'paragraph_close');
        nodes.push(createElement('p', { key }, ...inner.nodes));
        i = inner.next;
        break;
      }
      case 'th_open':
      case 'td_open': {
        const closeType = token.type === 'th_open' ? 'th_close' : 'td_close';
        const inner = parseBlocks(tokens, i + 1, closeType);
        nodes.push(createElement(token.tag, { key }, ...inner.nodes));
        i = inner.next;
        break;
      }
      case 'inline':
        nodes.push(...renderInline(token.children ?? []));
        i += 1;
        break;
      case 'fence':
      case 'code_block':
        nodes.push(
          createElement('pre', { key }, createElement('code', null, token.content)),
        );
        i += 1;
        break;
      case 'hr':
        nodes.push(createElement('hr', { key }));
        i += 1;
        break;
      default:
        // 其余块级 token（含各类 *_close）安全跳过，不输出任何原始内容
        i += 1;
        break;
    }
  }

  return { nodes, next: i };
};

/**
 * 把 Markdown 文本渲染为 React 节点
 * @param source - Markdown 原文
 * @returns React 节点数组，可直接放进 JSX
 */
export const renderMarkdown = (source: string): ReactNode[] =>
  parseBlocks(md.parse(source, {}), 0, null).nodes;
