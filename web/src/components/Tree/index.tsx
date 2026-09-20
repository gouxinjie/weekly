/**
 * @component 周次时间轴
 * @description 左栏「年 > 周」两层导航，以带圆点连线的垂直时间轴呈现；
 * 未写的周灰点、已写的周绿点、当前选中的周高亮成卡片
 * @author gouxinjie
 * @created 2026-09-18
 * @updated 2026-09-20
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { COLLAPSED_YEARS_KEY, MAX_WEEK, START_YEAR } from '@/constants';
import { formatWeekRangeShort } from '@/utils/format';
import { getCurrentWeek, getWeekRange } from '@/utils/week';import styles from './index.module.scss';

/** Tree 属性 */
interface TreeProps {
  /** 当前选中的 ISO 年 */
  year: number;
  /** 当前选中的周次（1-53） */
  week: number;
  /** 选中周变化时的回调 */
  onChange: (year: number, week: number) => void;
  /** 已写周次集合，元素形如「2026-38」，用于状态圆点 */
  written: Set<string>;
}

/** 单个周节点 */
interface WeekNode {
  /** ISO 周次 */
  week: number;
  /** 形如「09/14 - 09/20」 */
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
 * 周次时间轴
 * @param props - 见 TreeProps
 * @returns 时间轴节点
 */
const Tree = ({ year, week, onChange, written }: TreeProps) => {
  const years = useMemo(() => buildYears(year), [year]);

  const [collapsedYears, setCollapsedYears] = useState<number[]>(() => {
    const stored = readCollapsedYears();
    // 首次使用：展开当年，其余年份折叠
    return stored ?? buildYears(year).filter((item) => item !== getCurrentWeek().year);
  });

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
            range: formatWeekRangeShort(range.start, range.end).replace('–', ' - '),
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

  // 选中周变化时，把该节点滚动到可视区域
  const selectedRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [year, week]);

  return (
    <div className={styles.tree}>
      <h2 className={styles.title}>时间轴</h2>

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
                <span className={styles.yearLabel}>{node.year}</span>
              </button>

              {collapsed ? null : (
                <ul className={styles.weeks}>
                  {node.weeks.map((item) => {
                    const selected = node.year === year && item.week === week;
                    return (
                      <li key={`${node.year}-${item.week}`} className={styles.weekItem}>
                        <button
                          type="button"
                          ref={selected ? selectedRef : undefined}
                          className={selected ? styles.weekActive : styles.week}
                          onClick={() => onChange(node.year, item.week)}
                        >
                          {/* 时间轴圆点：当前选中带描边圈，已写为实心绿点，未写为灰点 */}
                          <span
                            className={
                              selected
                                ? styles.dotActive
                                : item.written
                                  ? styles.dotSaved
                                  : styles.dotEmpty
                            }
                            aria-label={item.written ? '已写' : '未写'}
                          />
                          <span className={styles.weekTexts}>
                            <span
                              className={
                                item.written || selected ? styles.weekText : styles.weekTextEmpty
                              }
                            >
                              第 {item.week} 周
                            </span>
                            <span className={styles.weekRange}>{item.range}</span>
                          </span>
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
