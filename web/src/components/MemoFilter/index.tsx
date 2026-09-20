/**
 * @component 备忘筛选标签页
 * @description 备忘页顶部的横向筛选标签：全部 / 未完成 / 已完成 / 已过期，各项带计数
 * @author gouxinjie
 * @created 2026-09-18
 * @updated 2026-09-20
 */
import type { MemoFilter as MemoFilterValue } from '@/types/models';
import styles from './index.module.scss';

/** 筛选项定义 */
interface FilterOption {
  /** 筛选标识 */
  key: MemoFilterValue;
  /** 展示文案 */
  label: string;
}

/** 四个筛选项，顺序与设计稿一致 */
const OPTIONS: FilterOption[] = [
  { key: 'all', label: '全部' },
  { key: 'undone', label: '未完成' },
  { key: 'done', label: '已完成' },
  { key: 'overdue', label: '已过期' },
];

/** MemoFilter 属性 */
interface MemoFilterProps {
  /** 当前筛选值 */
  value: MemoFilterValue;
  /** 切换筛选的回调 */
  onChange: (value: MemoFilterValue) => void;
  /** 各筛选项的计数 */
  counts: Record<MemoFilterValue, number>;
}

/**
 * 备忘筛选标签页
 * @param props - 见 MemoFilterProps
 * @returns 筛选标签节点
 */
const MemoFilter = ({ value, onChange, counts }: MemoFilterProps) => (
  <div className={styles.tabs} role="tablist" aria-label="备忘筛选">
    {OPTIONS.map((option) => {
      const selected = option.key === value;
      return (
        <button
          key={option.key}
          type="button"
          role="tab"
          aria-selected={selected}
          className={selected ? styles.tabActive : styles.tab}
          onClick={() => onChange(option.key)}
        >
          {option.label}
          <span className={styles.count}>（{counts[option.key]}）</span>
        </button>
      );
    })}
  </div>
);

export default MemoFilter;
