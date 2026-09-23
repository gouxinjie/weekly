/**
 * @component 工具条颜色下拉
 * @description 文字颜色与背景颜色共用的下拉面板：默认项 + 色板 + 可选渐变分区。
 * 面板用 fixed 定位挂在视口坐标系上，避免被祖先容器的 overflow 裁切；
 * 展开时按触发按钮位置计算坐标，下方放不下就向上翻
 * @author gouxinjie
 * @created 2026-09-23
 * @updated 2026-09-23
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CheckIcon, ToolButton } from './ToolbarButton';
import styles from './index.module.scss';

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

/** 颜色下拉菜单宽度（与样式中的定义保持一致） */
const MENU_WIDTH = 260;

/** 渐变分区配置 */
export interface GradientSection {
  /** 渐变预设列表 */
  options: string[];
  /** 当前渐变值（已规范化），未设置时为 null */
  current: string | null;
  /** 选中渐变回调 */
  onPick: (gradient: string) => void;
}

/** ToolbarColorMenu 属性 */
export interface ToolbarColorMenuProps {
  /** 触发按钮内容：文字或图标 */
  trigger: ReactNode;
  /** 触发按钮与面板的无障碍名称，同时作为悬停提示 */
  title: string;
  /** 当前颜色（小写十六进制），未设置时为 null */
  current: string | null;
  /** 选中颜色回调；null 表示恢复默认 */
  onPick: (color: string | null) => void;
  /** 是否禁用 */
  disabled: boolean;
  /** 渐变分区；不传时不渲染「渐变色」 */
  gradient?: GradientSection;
  /** 默认项是否用「无」（斜线）样式，背景颜色下拉使用 */
  emptyDefault?: boolean;
}

/**
 * 工具条颜色下拉
 * @param props - 见 ToolbarColorMenuProps
 * @returns 触发按钮与下拉面板
 */
const ToolbarColorMenu = ({
  trigger,
  title,
  current,
  onPick,
  disabled,
  gradient,
  emptyDefault = false,
}: ToolbarColorMenuProps) => {
  /** 面板是否展开 */
  const [open, setOpen] = useState(false);
  /** 面板的固定定位坐标（视口坐标） */
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  /** 触发按钮容器引用：用于点击外部关闭与计算面板位置 */
  const wrapRef = useRef<HTMLDivElement | null>(null);
  /** 面板本体引用：用于测量实际高度 */
  const menuRef = useRef<HTMLDivElement | null>(null);

  /**
   * 切换面板：展开时按按钮位置计算坐标（贴按钮右缘向左展开）
   * @returns 无
   */
  const toggleMenu = (): void => {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = wrapRef.current?.getBoundingClientRect();
    if (rect !== undefined) {
      setMenuPos({ top: rect.bottom + 4, left: Math.max(8, rect.right - MENU_WIDTH) });
    }
    setOpen(true);
  };

  /**
   * 选中颜色：应用后收起面板
   * @param color - 颜色值；null 表示恢复默认
   * @returns 无
   */
  const selectColor = (color: string | null): void => {
    onPick(color);
    setOpen(false);
  };

  // 展开期间：点击面板外部或按 Escape 关闭
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent): void => {
      if (wrapRef.current !== null && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // 窗口尺寸变化或页面滚动时按钮位置失效，直接收起面板
  // （scroll 不冒泡，用捕获阶段监听以覆盖编辑区等内部滚动容器）
  useEffect(() => {
    if (!open) return;

    const onResize = (): void => setOpen(false);
    const onScroll = (): void => setOpen(false);
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  // 面板展开后测量实际高度：放不下时向上翻，上下都放不下时贴视口顶部并内部滚动
  useLayoutEffect(() => {
    if (!open) return;
    const menuEl = menuRef.current;
    if (menuEl === null) return;

    const height = menuEl.offsetHeight;
    setMenuPos((prev) => {
      if (prev === null) return prev;
      if (prev.top + height <= window.innerHeight - 8) return prev;

      const rect = wrapRef.current?.getBoundingClientRect();
      return { ...prev, top: Math.max(8, (rect?.top ?? prev.top) - height - 4) };
    });
  }, [open]);

  /**
   * 单个色块
   * @param color - 颜色值
   * @param label - 无障碍名称前缀
   * @returns 色块节点
   */
  const renderSwatch = (color: string, label: string) => {
    const selected = current === color.toLowerCase();
    return (
      <button
        key={color}
        type="button"
        className={selected ? `${styles.swatch} ${styles.swatchActive}` : styles.swatch}
        style={{ backgroundColor: color }}
        title={`${title} ${color}`}
        aria-label={`${label} ${color}`}
        aria-pressed={selected}
        onClick={() => selectColor(color)}
      >
        {selected ? <CheckIcon /> : null}
      </button>
    );
  };

  /** 无渐变或无渐变回调时，不渲染渐变分区 */
  const gradientSection = gradient;

  return (
    <div className={styles.colorWrap} ref={wrapRef}>
      <ToolButton
        label={trigger}
        title={title}
        active={open}
        onClick={toggleMenu}
        disabled={disabled}
      />
      {open ? (
        <div
          ref={menuRef}
          className={styles.colorMenu}
          style={{ top: menuPos?.top, left: menuPos?.left }}
          aria-label={title}
        >
          {/* 默认项：清除当前颜色 */}
          <div className={styles.menuRow}>
            <button
              type="button"
              className={
                emptyDefault
                  ? `${styles.defaultSwatch} ${styles.defaultSwatchNone}`
                  : styles.defaultSwatch
              }
              title={`默认${title}`}
              aria-label={`默认（无${title}）`}
              aria-pressed={current === null && (gradientSection?.current ?? null) === null}
              onClick={() => selectColor(null)}
            >
              {current === null && (gradientSection?.current ?? null) === null ? (
                <CheckIcon />
              ) : null}
            </button>
            <span className={styles.defaultLabel}>默认</span>
          </div>
          {/* 色板：灰阶 + 亮色行 + 由浅到深色阶 */}
          <div className={styles.palette}>
            {PALETTE.flat().map((color) => renderSwatch(color, title))}
          </div>
          {/* 渐变分区：仅文字颜色使用 */}
          {gradientSection !== undefined ? (
            <>
              <div className={styles.menuTitle}>渐变色</div>
              <div className={styles.menuRow}>
                {gradientSection.options.map((item) => {
                  const selected = gradientSection.current === item;
                  return (
                    <button
                      key={item}
                      type="button"
                      className={
                        selected
                          ? `${styles.gradientSwatch} ${styles.swatchActive}`
                          : styles.gradientSwatch
                      }
                      style={{ backgroundImage: item }}
                      title="渐变文字"
                      aria-label={`渐变文字 ${item}`}
                      aria-pressed={selected}
                      onClick={() => {
                        gradientSection.onPick(item);
                        setOpen(false);
                      }}
                    >
                      {selected ? <CheckIcon /> : null}
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export default ToolbarColorMenu;
