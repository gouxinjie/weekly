/**
 * @component 待办筛选列
 * @description 待办态的左列，占位与宽度同周报态的时间轴：顶部固定「筛选」标题，
 * 下方纵向排列全部 / 本周 / 未完成 / 已完成，行尾右对齐计数；
 * 选中项为浅底圆角卡片 + 主色加粗文字（与时间轴选中周同一套强调方式）
 * @author gouxinjie
 * @created 2026-09-18
 * @updated 2026-09-22
 */
import type { TodoFilter as TodoFilterValue } from '@/types/models';
import styles from './index.module.scss';

/** 筛选项定义 */
interface FilterOption {
  /** 筛选标识 */
  key: TodoFilterValue;
  /** 展示文案 */
  label: string;
}

/** 四个筛选项，顺序与 PRD M-06 / 设计稿一致 */
const OPTIONS: FilterOption[] = [
  { key: 'all', label: '全部' },
  { key: 'week', label: '本周' },
  { key: 'undone', label: '未完成' },
  { key: 'done', label: '已完成' },
];

/** TodoFilter 属性 */
interface TodoFilterProps {
  /** 当前筛选值 */
  value: TodoFilterValue;
  /** 切换筛选的回调 */
  onChange: (value: TodoFilterValue) => void;
  /** 各筛选项的计数 */
  counts: Record<TodoFilterValue, number>;
}

/**
 * 待办筛选列
 * @param props - 见 TodoFilterProps
 * @returns 左列筛选节点
 */
const TodoFilter = ({ value, onChange, counts }: TodoFilterProps) => (
  <div className={styles.panel}>
    <h2 className={styles.title}>筛选</h2>

    {/*
      这里用「分组 + 按压态按钮」，不用 tablist / tab：
      那套语义要求方向键切换与配套的 tabpanel，只写一半反而会让读屏软件给出错误的交互预期。
      四个按钮互斥、点击即切换，aria-pressed 恰好表达这一点，键盘用 Tab 也完全可达。
    */}
    <div className={styles.items} role="group" aria-label="待办筛选">
      {OPTIONS.map((option) => {
        const selected = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            aria-pressed={selected}
            className={selected ? styles.itemActive : styles.item}
            onClick={() => onChange(option.key)}
          >
            <span className={styles.label}>{option.label}</span>
            <span className={styles.count}>{counts[option.key]}</span>
          </button>
        );
      })}
    </div>
  </div>
);

export default TodoFilter;
