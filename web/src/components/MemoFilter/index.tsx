/**
 * @component 备忘筛选器
 * @description 左栏备忘态的筛选器：全部 / 本周 / 未完成 / 已完成，各项带计数
 * @author gouxinjie
 * @created 2026-09-18
 * @updated 2026-09-18
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

/** 四个筛选项，顺序固定 */
const OPTIONS: FilterOption[] = [
  { key: 'all', label: '全部' },
  { key: 'current-week', label: '本周' },
  { key: 'undone', label: '未完成' },
  { key: 'done', label: '已完成' },
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
 * 备忘筛选器
 * @param props - 见 MemoFilterProps
 * @returns 筛选器节点
 */
const MemoFilter = ({ value, onChange, counts }: MemoFilterProps) => (
  <ul className={styles.filters}>
    {OPTIONS.map((option) => {
      const selected = option.key === value;
      return (
        <li key={option.key}>
          <button
            type="button"
            className={selected ? styles.filterActive : styles.filter}
            onClick={() => onChange(option.key)}
          >
            <span>{option.label}</span>
            <span className={styles.count}>{counts[option.key]}</span>
          </button>
        </li>
      );
    })}
  </ul>
);

export default MemoFilter;
