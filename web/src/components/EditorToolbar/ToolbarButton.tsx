/**
 * @component 工具条按钮
 * @description 工具条共用的基础元素：线性图标容器、单个工具按钮、选中对勾；
 * 抽到独立文件供主工具条与颜色下拉复用
 * @author gouxinjie
 * @created 2026-09-23
 * @updated 2026-09-23
 */
import type { ReactNode } from 'react';
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
export const Icon = ({ children }: IconProps) => (
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
export const ToolButton = ({
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
export const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
    <path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
