import MarkdownIt from 'markdown-it';
import { createElement } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { FONT_SIZE_PATTERN } from '@/constants';

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

/** 颜色值片段（与编辑器序列化白名单一致）：十六进制 / rgb() / rgba() */
const COLOR_VALUE =
  '(?:#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}|rgba?\\(\\s*[\\d.]+(?:\\s*,\\s*[\\d.]+%?){2,3}\\s*\\))';

/** 渐变值片段：仅允许水平两段式 linear-gradient，色段命中颜色白名单 */
const GRADIENT_VALUE = `linear-gradient\\(\\s*90deg\\s*,\\s*${COLOR_VALUE}\\s*,\\s*${COLOR_VALUE}\\s*\\)`;

/**
 * 单条允许出现在样式 span 上的声明：属性名与可用取值成对约束。
 * 原先是属性名白名单与取值白名单各自独立匹配，`color:16px` 这种两边单看都合法、
 * 组合起来毫无意义的声明也能通过；成对之后每种属性只认自己的取值。
 * 覆盖编辑器序列化会产出的全部样式：
 * color / background-color / background-image + background-clip（渐变文字）/ font-size
 */
const STYLE_ENTRY = [
  `color\\s*:\\s*(?:${COLOR_VALUE}|transparent)`,
  `background-color\\s*:\\s*(?:${COLOR_VALUE}|transparent)`,
  `background-image\\s*:\\s*${GRADIENT_VALUE}`,
  `(?:-webkit-)?background-clip\\s*:\\s*text`,
  `font-size\\s*:\\s*${FONT_SIZE_PATTERN}`,
].join('|');

/** 样式 span 的样式串白名单：一到多条白名单声明，以分号连接 */
const STYLE_LIST_RE = new RegExp(`^(?:${STYLE_ENTRY})(?:;(?:${STYLE_ENTRY}))*$`);

/** 颜色 span 开标签：样式串作为捕获组（取值随后再做白名单校验） */
const COLOR_SPAN_OPEN = /^<span style="([^"]*)">/;

/** 颜色 span 闭标签 */
const COLOR_SPAN_CLOSE = '</span>';

/** 内联样式属性名到 React 样式键的映射（未列出的属性一律忽略） */
const STYLE_KEY_MAP: Record<string, string> = {
  color: 'color',
  'background-color': 'backgroundColor',
  'background-image': 'backgroundImage',
  'background-clip': 'backgroundClip',
  '-webkit-background-clip': 'WebkitBackgroundClip',
  'font-size': 'fontSize',
};

/**
 * 把内联样式串转成 React 样式对象
 * @param raw - 形如「color:#fff;background-color:#000」的样式串（已通过白名单校验）
 * @returns React 样式对象；React 的 style 只接受对象，字符串会被忽略
 */
const parseInlineStyle = (raw: string): CSSProperties => {
  const style: Record<string, string> = {};

  raw.split(';').forEach((entry) => {
    const index = entry.indexOf(':');
    if (index <= 0) return;

    const key = STYLE_KEY_MAP[entry.slice(0, index).trim()];
    if (key === undefined) return;

    style[key] = entry.slice(index + 1).trim();
  });

  return style;
};

/**
 * 找到与开标签配对的 </span> 位置
 * @param src - 整段内联文本
 * @param from - 内文起始下标
 * @returns 配对闭标签的下标；找不到时返回 -1
 * @remarks 按嵌套层数配对，保证嵌套的颜色 span 也能正确收口
 */
const findColorSpanEnd = (src: string, from: number): number => {
  let depth = 1;
  let cursor = from;

  while (cursor < src.length) {
    const nextOpen = src.indexOf('<span style="', cursor);
    const nextClose = src.indexOf(COLOR_SPAN_CLOSE, cursor);
    if (nextClose === -1) return -1;

    // 先遇到更靠前的开标签就是嵌套一层
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth += 1;
      cursor = nextOpen + 1;
      continue;
    }

    depth -= 1;
    if (depth === 0) return nextClose;
    cursor = nextClose + COLOR_SPAN_CLOSE.length;
  }

  return -1;
};

/** GFM 任务列表标记：列表项开头的「[ ]」「[x]」 */
const TASK_MARK = /^\[([ xX])\]\s+/;

/** 写进 token.meta 的任务列表标记，供 parseBlocks 渲染时取用 */
interface TaskListMeta {
  /** 该列表是否为任务列表（至少含一个任务项） */
  taskList?: boolean;
  /** 该列表项是否为任务项，以及是否已完成 */
  task?: { checked: boolean };
}

/**
 * 在 token 流上标记 GFM 任务列表
 * @param tokens - markdown-it 解析出的 token 流，原地修改
 * @returns 无
 * @remarks markdown-it 原生不认识「- [ ] xxx」，会把它当成普通无序列表项，
 *          预览里因此显示成「• [ ] xxx」。这里在 inline 规则之后扫描每个列表项的首个
 *          inline，命中就把「[ ]」前缀摘掉并打上标记，再由 parseBlocks 渲染成带勾选框的任务列表。
 */
const markTaskLists = (tokens: MdToken[]): void => {
  /** 列表层级栈：记录列表的 open token 与已识别出的任务项数量 */
  const listStack: { open: MdToken; taskCount: number }[] = [];
  /** 列表项栈：记录正在处理的列表项，以及它是否已检测过首个 inline */
  const itemStack: { token: MdToken; scanned: boolean }[] = [];

  tokens.forEach((token) => {
    // 列表开始：先入栈，确认里面确有任务项后再整体标记
    if (
      token.nesting === 1 &&
      (token.type === 'bullet_list_open' || token.type === 'ordered_list_open')
    ) {
      listStack.push({ open: token, taskCount: 0 });
      return;
    }

    if (
      token.nesting === -1 &&
      (token.type === 'bullet_list_close' || token.type === 'ordered_list_close')
    ) {
      const frame = listStack.pop();
      if (frame !== undefined && frame.taskCount > 0) {
        frame.open.meta = { ...(frame.open.meta ?? {}), taskList: true };
      }
      return;
    }

    if (token.type === 'list_item_open') {
      itemStack.push({ token, scanned: false });
      return;
    }

    if (token.type === 'list_item_close') {
      itemStack.pop();
      return;
    }

    if (token.type !== 'inline') return;

    // 每个列表项只看第一个 inline；嵌套列表的 inline 归属栈顶那个更内层的列表项
    const item = itemStack[itemStack.length - 1];
    if (item === undefined || item.scanned) return;
    item.scanned = true;

    const first = token.children?.[0];
    if (first === undefined || first.type !== 'text') return;

    const matched = first.content.match(TASK_MARK);
    if (matched === null) return;

    // 摘掉「[ ]」前缀；剩余文本为空时整体移除，避免渲染出空节点
    first.content = first.content.slice(matched[0].length);
    if (first.content === '') token.children?.shift();
    token.content = token.content.slice(matched[0].length);

    item.token.meta = {
      ...(item.token.meta ?? {}),
      task: { checked: matched[1].toLowerCase() === 'x' },
    };

    const frame = listStack[listStack.length - 1];
    if (frame !== undefined) frame.taskCount += 1;
  });
};

// 挂在 inline 之后：此时每个 inline 的 children 已生成，才能读到首个文本节点
md.core.ruler.after('inline', 'weekly-task-list', (state) => {
  markTaskLists(state.tokens);
});

/**
 * 颜色 span 的 inline 解析规则
 * 说明：注册在 text 规则之前（「<」是 text 规则的终止字符，因此每个标签位置都会被本规则轮到），
 * 一次匹配「开标签 + 内文 + 配对闭标签」，产出 color_open / color_close 包住内文 token。
 * 内文用 inline 解析递归处理，因此加粗、链接等格式照常生效；
 * 样式串与内文都必须命中白名单，未命中时按普通文本处理（不会吞内容）。
 */
md.inline.ruler.before('text', 'weekly-color', (state, silent) => {
  if (state.src.charCodeAt(state.pos) !== 0x3c /* < */) return false;

  const open = COLOR_SPAN_OPEN.exec(state.src.slice(state.pos));
  if (open === null) return false;

  const style = open[1];
  if (!STYLE_LIST_RE.test(style)) return false;

  const innerStart = state.pos + open[0].length;
  const innerEnd = findColorSpanEnd(state.src, innerStart);
  if (innerEnd === -1) return false;

  if (!silent) {
    const token = state.push('color_open', '', 1);
    token.attrSet('style', style);

    // 内文再跑一遍 inline 解析，保证 span 内的加粗、链接等格式不被丢掉
    const innerTokens: MdToken[] = [];
    state.md.inline.parse(state.src.slice(innerStart, innerEnd), state.md, state.env, innerTokens);
    innerTokens.forEach((innerToken) => state.tokens.push(innerToken));

    state.push('color_close', '', -1);
    state.pos = innerEnd + COLOR_SPAN_CLOSE.length;
  }

  return true;
});

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
  /** 标签属性（style 必须是对象，React 不接受字符串形式） */
  props: Record<string, string | CSSProperties>;
  /** 子节点 */
  children: ReactNode[];
}

/**
 * 渲染行内 token 序列
 * @param tokens - inline token 的 children
 * @param breaks - 是否把单个换行渲染为换行（默认 false，即空格）
 * @returns React 节点数组
 * @remarks 单换行在 markdown-it 里统一是 softbreak，是否换行由它自带的 renderer 决定；
 * 本项目手写 token → React 的渲染，走不到那个 renderer，因此必须在这里自己判。
 */
const renderInline = (tokens: MdToken[], breaks: boolean): ReactNode[] => {
  const root: ReactNode[] = [];
  const stack: InlineFrame[] = [];
  let current: ReactNode[] = root;

  tokens.forEach((token, index) => {
    // token 序列是静态渲染，用「类型 + 下标」组合作为 key 已足够稳定
    const key = `${token.type}-${index}`;

    // 颜色开标记：渲染为带 style 的 span（纯色 / 背景色 / 渐变），交给通用闭合逻辑收口
    if (token.type === 'color_open') {
      const raw = getAttr(token, 'style');
      const style = raw === '' ? undefined : parseInlineStyle(raw);
      stack.push({
        tag: 'span',
        props: style === undefined ? {} : { style },
        children: [],
      });
      current = stack[stack.length - 1].children;
      return;
    }

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
        current.push(breaks ? createElement('br', { key }) : ' ');
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
 * @param breaks - 是否把单个换行渲染为换行，透传给行内渲染
 * @returns 渲染节点与下一个待处理下标
 */
const parseBlocks = (
  tokens: MdToken[],
  start: number,
  stopType: string | null,
  breaks: boolean,
): BlockResult => {
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
      const inner = parseBlocks(tokens, i + 1, mapped.close, breaks);
      const meta = token.meta as TaskListMeta | null;
      const task = meta?.task ?? null;

      if (task !== null) {
        // 任务项：只读预览里用 defaultChecked + disabled，避免受控组件的告警
        nodes.push(
          createElement(
            mapped.tag,
            { key, 'data-type': 'taskItem', 'data-checked': String(task.checked) },
            createElement('input', {
              key: 'checkbox',
              type: 'checkbox',
              defaultChecked: task.checked,
              disabled: true,
            }),
            ...inner.nodes,
          ),
        );
      } else {
        nodes.push(
          createElement(
            mapped.tag,
            meta?.taskList === true ? { key, 'data-type': 'taskList' } : { key },
            ...inner.nodes,
          ),
        );
      }

      i = inner.next;
      continue;
    }

    switch (token.type) {
      case 'heading_open': {
        const inner = parseBlocks(tokens, i + 1, 'heading_close', breaks);
        nodes.push(createElement(token.tag, { key }, ...inner.nodes));
        i = inner.next;
        break;
      }
      case 'paragraph_open': {
        const inner = parseBlocks(tokens, i + 1, 'paragraph_close', breaks);
        nodes.push(createElement('p', { key }, ...inner.nodes));
        i = inner.next;
        break;
      }
      case 'th_open':
      case 'td_open': {
        const closeType = token.type === 'th_open' ? 'th_close' : 'td_close';
        const inner = parseBlocks(tokens, i + 1, closeType, breaks);
        nodes.push(createElement(token.tag, { key }, ...inner.nodes));
        i = inner.next;
        break;
      }
      case 'inline':
        nodes.push(...renderInline(token.children ?? [], breaks));
        i += 1;
        break;
      case 'fence':
      case 'code_block':
        nodes.push(createElement('pre', { key }, createElement('code', null, token.content)));
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
 * @param breaks - 是否把单个换行也当换行（默认 false，即标准 Markdown：单换行视作空格）
 * @returns React 节点数组，可直接放进 JSX
 * @remarks 便签那种「一行一条」的随手记靠 breaks 保留换行；周报正文仍走标准语义，
 * 段落之间必须空行。该开关作用于本文件的渲染过程，不碰 markdown-it 实例配置。
 */
export const renderMarkdown = (source: string, breaks = false): ReactNode[] =>
  parseBlocks(md.parse(source, {}), 0, null, breaks).nodes;
