/**
 * @component 周次树
 * @description 左侧「年 > 周」两层导航树，未写的周同样列出，支持折叠展开、定位本周与跳转周次
 * @author gouxinjie
 * @created 2026-09-18
 * @updated 2026-09-18
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { COLLAPSED_YEARS_KEY, MAX_WEEK, START_YEAR } from '@/constants';
import { formatWeekRangeShort } from '@/utils/format';
import { getCurrentWeek, getWeekRange, isValidWeek } from '@/utils/week';
import styles from './index.module.scss';

/** 树对外暴露的命令能力，供页面快捷键调用 */
export interface TreeHandle {
  /** 折叠 / 展开全部年节点 */
  toggleAll: () => void;
  /** 聚焦「跳转到周次」输入框 */
  focusJump: () => void;
}

/** Tree 属性 */
interface TreeProps {
  /** 当前选中的 ISO 年 */
  year: number;
  /** 当前选中的周次（1-53） */
  week: number;
  /** 选中周变化时的回调 */
  onChange: (year: number, week: number) => void;
  /** 已写周次集合，元素形如「2026-38」，用于状态角标 */
  written: Set<string>;
  /** 命令引用，用于快捷键操作，可选 */
  treeRef?: RefObject<TreeHandle | null>;
}

/** 单个周节点 */
interface WeekNode {
  /** ISO 周次 */
  week: number;
  /** 形如「09/14–09/20」 */
  range: string;
  /** 是否已写 */
  written: boolean;
}

/** 单个年节点 */
interface YearNode {
  /** ISO 年 */
  year: number;
  /** 该年的全部周节点 */
  weeks: WeekNode[];
}

/**
 * 生成需要展示的年份列表
 * @param selectedYear - 当前选中的年份
 * @returns 从起点年份到 max(当前年, 选中年) 的年份数组
 */
const buildYears = (selectedYear: number): number[] => {
  const endYear = Math.max(getCurrentWeek().year, selectedYear);
  const years: number[] = [];
  for (let y = START_YEAR; y <= endYear; y += 1) {
    years.push(y);
  }
  return years;
};

/**
 * 读取折叠状态
 * @returns 已折叠的年份数组；无记录或读取失败时返回 null
 */
const readCollapsedYears = (): number[] | null => {
  try {
    const raw = window.localStorage.getItem(COLLAPSED_YEARS_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((item): item is number => typeof item === 'number');
  } catch {
    return null;
  }
};

/**
 * 持久化折叠状态
 * @param years - 已折叠的年份数组
 * @returns 无
 */
const writeCollapsedYears = (years: number[]): void => {
  try {
    window.localStorage.setItem(COLLAPSED_YEARS_KEY, JSON.stringify(years));
  } catch {
    // 隐私模式等场景下写入失败不影响使用，忽略即可
  }
};

/**
 * 解析跳转输入
 * @param input - 用户输入，如「2026 年第 15 周」
 * @returns 解析出的周次；无法解析或越界时返回 null
 */
const parseJumpInput = (input: string): { year: number; week: number } | null => {
  const matched = input.match(/(\d{4})\D*(\d{1,2})/);
  if (matched === null) return null;

  const year = Number(matched[1]);
  const week = Number(matched[2]);
  return isValidWeek(year, week) ? { year, week } : null;
};

/**
 * 周次树
 * @param props - 见 TreeProps
 * @returns 两层树节点
 */
const Tree = ({ year, week, onChange, written, treeRef }: TreeProps) => {
  const current = useMemo(() => getCurrentWeek(), []);
  const years = useMemo(() => buildYears(year), [year]);

  const [collapsedYears, setCollapsedYears] = useState<number[]>(() => {
    const stored = readCollapsedYears();
    // 首次使用：展开当年，其余年份折叠
    return stored ?? buildYears(year).filter((item) => item !== getCurrentWeek().year);
  });

  const [jumpInput, setJumpInput] = useState('');
  const [jumpError, setJumpError] = useState('');
  const jumpInputRef = useRef<HTMLInputElement | null>(null);

  /** 树数据：一次性算好周次与日期，避免渲染期重复计算 */
  const treeData = useMemo<YearNode[]>(
    () =>
      years.map((item) => ({
        year: item,
        weeks: Array.from({ length: MAX_WEEK }, (_, index): WeekNode => {
          const weekNo = index + 1;
          const range = getWeekRange(item, weekNo);
          return {
            week: weekNo,
            range: formatWeekRangeShort(range.start, range.end),
            written: written.has(`${item}-${weekNo}`),
          };
        }),
      })),
    [years, written],
  );

  /**
   * 折叠状态变更并持久化
   * @param next - 新的折叠年份数组
   * @returns 无
   */
  const updateCollapsed = useCallback((next: number[]): void => {
    setCollapsedYears(next);
    writeCollapsedYears(next);
  }, []);

  /**
   * 切换单个年节点的折叠状态
   * @param targetYear - 目标年份
   * @returns 无
   */
  const toggleYear = useCallback(
    (targetYear: number): void => {
      const next = collapsedYears.includes(targetYear)
        ? collapsedYears.filter((item) => item !== targetYear)
        : [...collapsedYears, targetYear];
      updateCollapsed(next);
    },
    [collapsedYears, updateCollapsed],
  );

  /** 收起全部年节点 */
  const collapseAll = useCallback((): void => {
    updateCollapsed(years);
  }, [years, updateCollapsed]);

  /** 展开全部年节点 */
  const expandAll = useCallback((): void => {
    updateCollapsed([]);
  }, [updateCollapsed]);

  /** 折叠 / 展开全部：已全部折叠时展开，否则收起 */
  const toggleAll = useCallback((): void => {
    const allCollapsed = years.every((item) => collapsedYears.includes(item));
    updateCollapsed(allCollapsed ? [] : years);
  }, [years, collapsedYears, updateCollapsed]);

  // 供页面快捷键（Ctrl+B / Ctrl+K）调用
  useEffect(() => {
    if (treeRef === undefined) return undefined;

    treeRef.current = {
      toggleAll,
      focusJump: () => jumpInputRef.current?.focus(),
    };

    return () => {
      treeRef.current = null;
    };
  }, [treeRef, toggleAll]);

  /** 定位到当前 ISO 周 */
  const goCurrentWeek = useCallback((): void => {
    onChange(current.year, current.week);
  }, [current, onChange]);

  /** 执行跳转 */
  const handleJump = useCallback((): void => {
    const parsed = parseJumpInput(jumpInput);
    if (parsed === null) {
      setJumpError('请输入形如「2026 年第 15 周」的周次');
      return;
    }
    setJumpError('');
    setJumpInput('');
    onChange(parsed.year, parsed.week);
  }, [jumpInput, onChange]);

  const isCurrentWeek = year === current.year && week === current.week;

  return (
    <div className={styles.tree}>
      <div className={styles.toolbar}>
        <button type="button" className={styles.toolButton} onClick={expandAll}>
          展开全部
        </button>
        <button type="button" className={styles.toolButton} onClick={collapseAll}>
          收起全部
        </button>
        <button
          type="button"
          className={styles.toolButton}
          onClick={goCurrentWeek}
          disabled={isCurrentWeek}
        >
          定位本周
        </button>
      </div>

      <div className={styles.jump}>
        <input
          ref={jumpInputRef}
          className={styles.jumpInput}
          value={jumpInput}
          placeholder="跳转：2026 年第 15 周"
          onChange={(event) => setJumpInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') handleJump();
          }}
        />
        <button type="button" className={styles.jumpButton} onClick={handleJump}>
          跳转
        </button>
      </div>
      {jumpError !== '' ? <p className={styles.jumpError}>{jumpError}</p> : null}

      <div className={styles.years}>
        {treeData.map((node) => {
          const collapsed = collapsedYears.includes(node.year);
          return (
            <section key={node.year} className={styles.year}>
              <button
                type="button"
                className={styles.yearHeader}
                onClick={() => toggleYear(node.year)}
              >
                <span className={collapsed ? styles.caret : styles.caretOpen}>▸</span>
                <span className={styles.yearLabel}>{node.year} 年</span>
              </button>

              {collapsed ? null : (
                <ul className={styles.weeks}>
                  {node.weeks.map((item) => {
                    const selected = node.year === year && item.week === week;
                    return (
                      <li key={`${node.year}-${item.week}`}>
                        <button
                          type="button"
                          className={selected ? styles.weekActive : styles.week}
                          onClick={() => onChange(node.year, item.week)}
                        >
                          <span className={item.written ? styles.weekText : styles.weekTextEmpty}>
                            第 {item.week} 周
                          </span>
                          <span className={styles.weekRange}>{item.range}</span>
                          <span
                            className={item.written ? styles.dotSaved : styles.dotEmpty}
                            aria-label={item.written ? '已写' : '未写'}
                          />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
};

export default Tree;
