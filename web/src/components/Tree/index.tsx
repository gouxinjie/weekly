/**
 * @component 周次时间轴
 * @description 左栏「年 > 月 > 周」三层导航，以带圆点连线的垂直时间轴呈现；
 * 未写的周灰点、已写的周绿点、当前选中的周高亮成卡片
 * @author gouxinjie
 * @created 2026-09-18
 * @updated 2026-09-22
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EXPANDED_MONTHS_KEY, EXPANDED_YEARS_KEY, MAX_WEEK, START_YEAR } from '@/constants';
import { formatWeekRangeShort } from '@/utils/format';
import { getCurrentWeek, getWeekCount, getWeekMonth, getWeekRange } from '@/utils/week';
import styles from './index.module.scss';

/** 一年固定 12 个月 */
const MONTHS_PER_YEAR = 12;

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
  /** 形如「09/14 – 09/20」 */
  range: string;
  /** 是否已写 */
  written: boolean;
}

/** 单个月份节点 */
interface MonthNode {
  /** 月份（1-12） */
  month: number;
  /** 该月包含的周节点 */
  weeks: WeekNode[];
  /** 该月已写的周数，为 0 时整行淡显 */
  writtenCount: number;
}

/** 单个年节点 */
interface YearNode {
  /** ISO 年 */
  year: number;
  /** 该年的全部月份节点，只包含有周次分组的月份 */
  months: MonthNode[];
}

/** 折叠箭头属性 */
interface CaretIconProps {
  /** 箭头类名：展开态传入带旋转的类，收起态传入基础类 */
  className: string;
}

/**
 * 折叠箭头图标
 * @param props - 见 CaretIconProps
 * @returns 箭头图标节点
 * @remarks 用 SVG 折线而不是「▸」字符：字符的字形、基线与粗细随字体变化，
 *          旋转 90° 后还会偏离视觉中心，跨平台表现不一致。
 */
const CaretIcon = ({ className }: CaretIconProps) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="m9 6 6 6-6 6" />
  </svg>
);

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
 * 生成月份键
 * @param year - ISO 年
 * @param month - 月份（1-12）
 * @returns 形如「2026-9」的键
 */
const monthKey = (year: number, month: number): string => `${year}-${month}`;

/**
 * 读取已展开的年份
 * @returns 已展开的年份数组；无记录或读取失败时返回 null
 */
const readExpandedYears = (): number[] | null => {
  try {
    const raw = window.localStorage.getItem(EXPANDED_YEARS_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((item): item is number => typeof item === 'number');
  } catch {
    return null;
  }
};

/**
 * 持久化已展开的年份
 * @param years - 已展开的年份数组
 * @returns 无
 */
const writeExpandedYears = (years: number[]): void => {
  try {
    window.localStorage.setItem(EXPANDED_YEARS_KEY, JSON.stringify(years));
  } catch {
    // 隐私模式等场景下写入失败不影响使用，忽略即可
  }
};

/**
 * 读取已展开的月份
 * @returns 已展开的月份键数组；无记录或读取失败时返回 null
 */
const readExpandedMonths = (): string[] | null => {
  try {
    const raw = window.localStorage.getItem(EXPANDED_MONTHS_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return null;
  }
};

/**
 * 持久化已展开的月份
 * @param months - 已展开的月份键数组
 * @returns 无
 */
const writeExpandedMonths = (months: string[]): void => {
  try {
    window.localStorage.setItem(EXPANDED_MONTHS_KEY, JSON.stringify(months));
  } catch {
    // 隐私模式等场景下写入失败不影响使用，忽略即可
  }
};

/**
 * 周次时间轴
 * @param props - 见 TreeProps
 * @returns 时间轴节点
 * @remarks 折叠状态按「展开集合」记录而非「折叠集合」：默认全部折叠，
 *          只有显式展开过的年 / 月才落进集合。这样运行期新增的年份（跨年、跳转未来）天然是折叠的，
 *          不会因为「不在折叠名单里」而一次性铺开上百个周节点。
 */
const Tree = ({ year, week, onChange, written }: TreeProps) => {
  const years = useMemo(() => buildYears(year), [year]);

  // 首次使用只展开选中的年份，其余年份折叠
  const [expandedYears, setExpandedYears] = useState<number[]>(
    () => readExpandedYears() ?? [year],
  );

  // 首次使用只展开选中周所在的月份，避免一次铺开 53 个周节点
  const [expandedMonths, setExpandedMonths] = useState<string[]>(
    () => readExpandedMonths() ?? [monthKey(year, getWeekMonth(year, week))],
  );

  /** 树数据：一次性算好月份分组、周次与日期，避免渲染期重复计算 */
  const treeData = useMemo<YearNode[]>(
    () =>
      years.map((item) => {
        /** 按月份分桶，下标 0 对应 1 月 */
        const buckets: WeekNode[][] = Array.from({ length: MONTHS_PER_YEAR }, () => []);
        const total = getWeekCount(item);

        for (let weekNo = 1; weekNo <= MAX_WEEK; weekNo += 1) {
          const hasData = written.has(`${item}-${weekNo}`);
          // 第 53 周并非每年都有：该年不存在这一周且历史上也没写过时跳过，
          // 否则它会被错误地归进次年 1 月的分组（如 2027 年第 53 周实为 2028 年第 1 周）
          if (weekNo > total && !hasData) continue;

          const range = getWeekRange(item, weekNo);
          buckets[getWeekMonth(item, weekNo) - 1].push({
            week: weekNo,
            range: formatWeekRangeShort(range.start, range.end).replace('–', ' – '),
            written: hasData,
          });
        }

        return {
          year: item,
          months: buckets
            .map((weeks, index) => ({
              month: index + 1,
              weeks,
              writtenCount: weeks.filter((node) => node.written).length,
            }))
            .filter((node) => node.weeks.length > 0),
        };
      }),
    [years, written],
  );

  /**
   * 更新已展开的年份并持久化
   * @param next - 新的已展开年份数组
   * @returns 无
   */
  const updateExpandedYears = useCallback((next: number[]): void => {
    setExpandedYears(next);
    writeExpandedYears(next);
  }, []);

  /**
   * 更新已展开的月份并持久化
   * @param next - 新的已展开月份键数组
   * @returns 无
   */
  const updateExpandedMonths = useCallback((next: string[]): void => {
    setExpandedMonths(next);
    writeExpandedMonths(next);
  }, []);

  /**
   * 切换单个年节点的折叠状态
   * @param targetYear - 目标年份
   * @returns 无
   */
  const toggleYear = useCallback(
    (targetYear: number): void => {
      const next = expandedYears.includes(targetYear)
        ? expandedYears.filter((item) => item !== targetYear)
        : [...expandedYears, targetYear];
      updateExpandedYears(next);
    },
    [expandedYears, updateExpandedYears],
  );

  /**
   * 切换单个月份节点的折叠状态
   * @param targetKey - 目标月份键，形如「2026-9」
   * @returns 无
   */
  const toggleMonth = useCallback(
    (targetKey: string): void => {
      const next = expandedMonths.includes(targetKey)
        ? expandedMonths.filter((item) => item !== targetKey)
        : [...expandedMonths, targetKey];
      updateExpandedMonths(next);
    },
    [expandedMonths, updateExpandedMonths],
  );

  /** 上一次渲染时的选中周，用于区分「外部导航」与「用户手动折叠」 */
  const lastSelectedRef = useRef(`${year}-${week}`);

  // 上一周 / 下一周、搜索跳转等外部导航后，展开目标周所在的年与月，
  // 否则选中项会藏在折叠节点里；用户手动折叠当前节点不受影响
  useEffect(() => {
    const current = `${year}-${week}`;
    if (lastSelectedRef.current === current) return;
    lastSelectedRef.current = current;

    if (!expandedYears.includes(year)) {
      updateExpandedYears([...expandedYears, year]);
    }

    const key = monthKey(year, getWeekMonth(year, week));
    if (!expandedMonths.includes(key)) {
      updateExpandedMonths([...expandedMonths, key]);
    }
  }, [
    year,
    week,
    expandedYears,
    expandedMonths,
    updateExpandedYears,
    updateExpandedMonths,
  ]);

  // 选中周变化（含展开后才出现在 DOM 中）时，把该节点滚动到可视区域
  const selectedRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [year, week, treeData]);

  return (
    <div className={styles.tree}>
      <h2 className={styles.title}>时间轴</h2>

      <div className={styles.years}>
        {treeData.map((node) => {
          const expanded = expandedYears.includes(node.year);
          return (
            <section key={node.year} className={styles.year}>
              <button
                type="button"
                className={styles.yearHeader}
                onClick={() => toggleYear(node.year)}
              >
                <CaretIcon className={expanded ? styles.caretOpen : styles.caret} />
                <span className={styles.yearLabel}>{node.year}</span>
              </button>

              {expanded ? (
                <div className={styles.months}>
                  {node.months.map((monthNode) => {
                    const key = monthKey(node.year, monthNode.month);
                    const monthExpanded = expandedMonths.includes(key);
                    return (
                      <section key={key} className={styles.month}>
                        <button
                          type="button"
                          className={
                            monthNode.writtenCount > 0
                              ? styles.monthHeader
                              : styles.monthHeaderEmpty
                          }
                          onClick={() => toggleMonth(key)}
                        >
                          <CaretIcon
                            className={monthExpanded ? styles.caretOpen : styles.caret}
                          />
                          <span className={styles.monthLabel}>{monthNode.month} 月</span>
                          {/* 该月有已写周时补一个绿点，折叠状态下也能看出哪个月写过 */}
                          {monthNode.writtenCount > 0 ? (
                            <span
                              className={styles.monthDot}
                              aria-label={`已写 ${monthNode.writtenCount} 周`}
                            />
                          ) : null}
                        </button>

                        {monthExpanded ? (
                          <ul className={styles.weeks}>
                            {monthNode.weeks.map((item) => {
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
                                          item.written || selected
                                            ? styles.weekText
                                            : styles.weekTextEmpty
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
                        ) : null}
                      </section>
                    );
                  })}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
};

export default Tree;
