/**
 * @component Markdown 编辑器
 * @description 基于 TipTap 的所见即所得编辑器；底层仍读写 Markdown 字符串，
 * 因此自动保存、单周导出、右栏参考等既有链路完全不变
 * @author gouxinjie
 * @created 2026-09-18
 * @updated 2026-09-18
 */
import { EditorContent, useEditor } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import styles from './index.module.scss';

/** 编辑器对外暴露的能力 */
export interface MarkdownEditorHandle {
  /** TipTap 编辑器实例，工具条据此调用命令 */
  editor: Editor | null;
  /** 取编辑器滚动位置 */
  getScrollTop: () => number;
  /** 恢复编辑器滚动位置 */
  setScrollTop: (top: number) => void;
  /** 让编辑器获得焦点 */
  focus: () => void;
}

/**
 * 剪贴板纯文本中的 Markdown 块级语法：标题 / 无序列表 / 有序列表 / 引用 / 代码块 / 表格
 * 只认行首语法，避免把正文里零散的符号误判成 Markdown
 */
const MARKDOWN_BLOCK = /^[ \t]{0,3}(?:#{1,6}[ \t]|[-*+][ \t]|\d+\.[ \t]|>[ \t]|`{3}|\|.*\|)/m;

/**
 * 判断剪贴板纯文本是否应当按 Markdown 解析
 * @param text - 剪贴板中的纯文本
 * @returns 含块级 Markdown 语法时返回 true
 */
const looksLikeMarkdown = (text: string): boolean => MARKDOWN_BLOCK.test(text);

/** MarkdownEditor 属性 */
interface MarkdownEditorProps {
  /** 编辑器内容（Markdown 字符串） */
  value: string;
  /** 内容变化回调，输入停止后由上层做自动保存 */
  onChange: (value: string) => void;
  /** 命令引用，用于工具条操作与模式切换时保留滚动位置 */
  editorRef: RefObject<MarkdownEditorHandle | null>;
  /** 编辑器实例就绪回调，父组件据此把实例传给工具条 */
  onEditorReady?: (editor: Editor | null) => void;
}

/**
 * Markdown 编辑器
 * @param props - 见 MarkdownEditorProps
 * @returns 编辑器节点
 */
const MarkdownEditor = ({ value, onChange, editorRef, onEditorReady }: MarkdownEditorProps) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // 用 ref 持有最新回调，避免父组件重渲染导致编辑器实例被反复重建
  const onChangeRef = useRef(onChange);
  const initialValueRef = useRef(value);

  /** 编辑器实例，供 handlePaste 在配置对象内部取用（配置求值时实例尚未返回） */
  const editorInstanceRef = useRef<Editor | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown,
      TaskList,
      TaskItem.configure({ nested: true }),
      Table,
      TableRow,
      TableHeader,
      TableCell,
    ],
    // 首次挂载时的内容；后续切周次由 setContent 同步
    content: initialValueRef.current,
    contentType: 'markdown',
    editorProps: {
      attributes: {
        // 稳定的类名，供全局样式做排版，同时作为内容区作用域前缀避免污染其它组件
        class: 'weekly-editor',
        spellcheck: 'false',
      },
      // 从网页或其他编辑器复制时，剪贴板里往往同时带一份 HTML，浏览器默认优先用它，
      // 任务的「- [ ]」语义会在来源 HTML 里退化掉，导致粘进来变成普通无序列表。
      // 这里只要纯文本是 Markdown 语法，就改走 Markdown 解析，保证粘进来的结构与原文一致。
      handlePaste: (_view, event) => {
        const text = event.clipboardData?.getData('text/plain') ?? '';
        const target = editorInstanceRef.current;

        if (target === null || !looksLikeMarkdown(text)) return false;

        event.preventDefault();
        target.chain().focus().insertContent(text, { contentType: 'markdown' }).run();
        return true;
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      onChangeRef.current(currentEditor.getMarkdown());
    },
  });

  // 把编辑器实例同步给 handlePaste 使用
  useEffect(() => {
    editorInstanceRef.current = editor;
  }, [editor]);

  // 外部内容变化（切换周次、注入模板、清空模板）时整篇同步，且不回传 onUpdate
  useEffect(() => {
    if (editor === null) return;
    const current = editor.getMarkdown();
    if (current === value) return;

    editor.commands.setContent(value, { contentType: 'markdown', emitUpdate: false });
  }, [value, editor]);

  // 把编辑器实例与滚动控制暴露给父组件
  useEffect(() => {
    editorRef.current = {
      editor,
      getScrollTop: () => scrollRef.current?.scrollTop ?? 0,
      setScrollTop: (top) => {
        if (scrollRef.current !== null) scrollRef.current.scrollTop = top;
      },
      focus: () => {
        editor?.commands.focus();
      },
    };

    return () => {
      editorRef.current = null;
    };
  }, [editor, editorRef]);

  // 通知父组件编辑器实例已就绪（工具条需要）
  useEffect(() => {
    onEditorReady?.(editor);
  }, [editor, onEditorReady]);

  return (
    <div className={styles.editor} ref={scrollRef}>
      <EditorContent editor={editor} />
    </div>
  );
};

export default MarkdownEditor;
