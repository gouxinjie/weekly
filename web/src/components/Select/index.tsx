/**
 * @component 下拉选择
 * @description 统一的下拉选择控件，用来替代原生 select：外观完全由设计变量控制，
 * 支持上下键 / Home / End / 回车 / Esc 键盘操作，点击外部关闭；
 * 面板通过 portal 渲染到 body，避免被列表、抽屉等容器的 overflow 裁剪
 * @author gouxinjie
 * @created 2026-09-22
 * @updated 2026-09-22
 */
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import styles from './index.module.scss';

/** 下拉选项 */
export interface SelectOption {
  /** 选项值 */
  value: string;
  /** 选项展示文案 */
  label: string;
}

/** Select 属性 */
export interface SelectProps {
  /** 当前选中值（受控） */
  value: string;
  /** 可选项列表 */
  options: SelectOption[];
  /** 选中项变化回调，参数为新的选项值 */
  onChange: (value: string) => void;
  /** 无障碍名称，写到 aria-label 上 */
  ariaLabel: string;
  /** 尺寸：sm 用于表单与抽屉，md 用于顶栏，默认 sm */
  size?: 'sm' | 'md';
  /** 是否占满父容器宽度，默认 false */
  block?: boolean;
  /** 是否禁用，默认 false */
  disabled?: boolean;
  /** 外层额外类名，供父级控制定位 */
  className?: string;
}

/** 面板定位结果（相对视口的 fixed 坐标） */
interface PanelPosition {
  /** 面板顶边距视口顶部的距离 */
  top: number;
  /** 面板左边距视口左侧的距离 */
  left: number;
  /** 面板最小宽度，与触发按钮对齐 */
  minWidth: number;
  /** 面板最大高度，按上下可用空间取 */
  maxHeight: number;
}

/** 面板与触发按钮之间的间距 */
const PANEL_GAP = 4;

/** 面板高度上限，避免选项过多时铺满整屏 */
const PANEL_MAX_HEIGHT = 280;

/** 面板距视口边缘的最小留白 */
const VIEWPORT_PADDING = 8;

/**
 * 拼接类名，过滤掉条件表达式产生的空值
 * @param names - 类名或假值
 * @returns 以空格连接的类名字符串
 */
const cx = (...names: (string | false | undefined)[]): string =>
  names.filter((name) => typeof name === 'string' && name !== '').join(' ');

/**
 * 计算面板的定位
 * @param trigger - 触发按钮元素
 * @returns 定位结果；元素不存在时返回 null
 * @remarks 下方空间不够就向上弹，并按可用空间限制面板高度，避免出现「面板超出视口还要滚动页面」的情况。
 */
const computePosition = (trigger: HTMLElement | null): PanelPosition | null => {
  if (trigger === null) return null;

  const rect = trigger.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom - PANEL_GAP - VIEWPORT_PADDING;
  const spaceAbove = rect.top - PANEL_GAP - VIEWPORT_PADDING;

  const openBelow = spaceBelow >= PANEL_MAX_HEIGHT || spaceBelow >= spaceAbove;
  const available = Math.max(openBelow ? spaceBelow : spaceAbove, 0);
  const maxHeight = Math.max(Math.min(PANEL_MAX_HEIGHT, available), 0);

  const rightmost = window.innerWidth - rect.width - VIEWPORT_PADDING;
  const left = Math.min(Math.max(rect.left, VIEWPORT_PADDING), Math.max(rightmost, VIEWPORT_PADDING));

  return {
    top: openBelow ? rect.bottom + PANEL_GAP : Math.max(rect.top - PANEL_GAP - maxHeight, VIEWPORT_PADDING),
    left,
    minWidth: rect.width,
    maxHeight,
  };
};

/**
 * 下拉选择
 * @param props - 见 SelectProps
 * @returns 下拉选择节点
 */
const Select = ({
  value,
  options,
  onChange,
  ariaLabel,
  size = 'sm',
  block = false,
  disabled = false,
  className,
}: SelectProps) => {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<PanelPosition | null>(null);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // 选项列表 id 需要稳定且唯一，用于 aria-controls / aria-activedescendant
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;

  /** 当前选中项下标，未匹配到任何选项时为 -1 */
  const selectedIndex = useMemo(
    () => options.findIndex((option) => option.value === value),
    [options, value],
  );

  /** 触发按钮上显示的文案 */
  const selectedLabel = useMemo(() => {
    const matched = options.find((option) => option.value === value);
    return matched === undefined ? '' : matched.label;
  }, [options, value]);

  /** 展开面板并把键盘高亮定位到当前选中项 */
  const openPanel = useCallback((): void => {
    if (disabled || options.length === 0) return;
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }, [disabled, options.length, selectedIndex]);

  /**
   * 选中某项并收起面板
   * @param index - 选项下标
   * @returns 无
   */
  const selectOption = useCallback(
    (index: number): void => {
      const option = options[index];
      if (option !== undefined && option.value !== value) {
        onChange(option.value);
      }
      setOpen(false);
      triggerRef.current?.focus();
    },
    [options, value, onChange],
  );

  /**
   * 触发按钮的键盘交互
   * @param event - 键盘事件
   * @returns 无
   */
  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (!open) {
      if (
        event.key === 'Enter' ||
        event.key === ' ' ||
        event.key === 'ArrowDown' ||
        event.key === 'ArrowUp'
      ) {
        event.preventDefault();
        openPanel();
      }
      return;
    }

    const total = options.length;
    if (total === 0) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActiveIndex((prev) => (prev + 1) % total);
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActiveIndex((prev) => (prev - 1 + total) % total);
        break;
      case 'Home':
        event.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        event.preventDefault();
        setActiveIndex(total - 1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        selectOption(activeIndex);
        break;
      case 'Escape':
        event.preventDefault();
        setOpen(false);
        break;
      case 'Tab':
        // Tab 离开时收起，避免面板留在页面上
        setOpen(false);
        break;
      default:
        break;
    }
  };

  // 面板定位：展开时算一次，页面滚动或窗口尺寸变化时跟随更新
  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return undefined;
    }

    const update = (): void => setPosition(computePosition(triggerRef.current));
    update();

    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  // 点击面板与触发按钮之外的区域时收起
  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event: MouseEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target) === true) return;
      if (panelRef.current?.contains(target) === true) return;
      setOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [open]);

  // 键盘高亮项变化时滚动到可视区域（周次有 53 个选项，必须跟着滚）
  useEffect(() => {
    if (!open) return;
    const node = panelRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    node?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  // 被禁用时立即收起
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  return (
    <div ref={rootRef} className={cx(styles.root, block && styles.rootBlock, className)}>
      <button
        ref={triggerRef}
        type="button"
        className={cx(
          styles.trigger,
          size === 'md' ? styles.sizeMd : styles.sizeSm,
          open && styles.triggerOpen,
        )}
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open ? `${listboxId}-${activeIndex}` : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openPanel())}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className={styles.value}>{selectedLabel}</span>
        <span className={cx(styles.caret, open && styles.caretOpen)} aria-hidden />
      </button>

      {open && position !== null
        ? createPortal(
            <div
              ref={panelRef}
              id={listboxId}
              role="listbox"
              aria-label={ariaLabel}
              className={styles.panel}
              style={{
                top: position.top,
                left: position.left,
                minWidth: position.minWidth,
                maxHeight: position.maxHeight,
              }}
            >
              {options.map((option, index) => {
                const selected = option.value === value;
                return (
                  <div
                    key={option.value}
                    id={`${listboxId}-${index}`}
                    role="option"
                    aria-selected={selected}
                    data-index={index}
                    className={cx(
                      styles.option,
                      index === activeIndex && styles.optionActive,
                      selected && styles.optionSelected,
                    )}
                    // 阻止 mousedown 抢走按钮焦点，点击后由 selectOption 统一处理焦点
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => selectOption(index)}
                  >
                    <span className={styles.optionLabel}>{option.label}</span>
                    {selected ? (
                      <span className={styles.check} aria-hidden>
                        ✓
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
};

export default Select;
