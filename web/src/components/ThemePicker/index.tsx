/**
 * @component 主题选择
 * @description 设置页「外观」卡片内的主题切换控件：三张主题卡，选中的卡片描主色边并显示对勾。
 * 卡片内的缩略预览直接借用对应主题的配色——预览元素自己挂 data-theme，
 * 由 variables.scss 的同名选择器命中那一套变量，因此预览色永远与真实主题一致，不用另写一份色值
 * @author gouxinjie
 * @created 2026-09-23
 * @updated 2026-09-23
 */
import { THEMES } from '@/constants';
import type { ThemeName } from '@/constants';
import styles from './index.module.scss';

/** ThemePicker 属性 */
interface ThemePickerProps {
  /** 当前主题（受控） */
  value: ThemeName;
  /** 切换主题的回调，参数为新的主题标识 */
  onChange: (theme: ThemeName) => void;
}

/**
 * 主题选择
 * @param props - 见 ThemePickerProps
 * @returns 主题选择节点
 * @remarks 用原生 radio 而不是 role="radio" 的 div：方向键切换、Tab 进入、读屏播报
 *          都由浏览器负责；单选按钮本身视觉隐藏，聚焦环画在卡片上。
 */
const ThemePicker = ({ value, onChange }: ThemePickerProps) => (
  <div className={styles.group} role="radiogroup" aria-label="主题">
    {THEMES.map((theme) => (
      <label key={theme.value} className={styles.option}>
        <input
          className={styles.radio}
          type="radio"
          name="weekly-theme"
          value={theme.value}
          checked={value === theme.value}
          onChange={() => onChange(theme.value)}
        />
        <span className={styles.card}>
          {/* 缩略预览：data-theme 让它内部的变量临时切到该主题 */}
          <span className={styles.preview} data-theme={theme.value} aria-hidden>
            <span className={styles.previewRail} />
            <span className={styles.previewBody}>
              <span className={styles.previewTitle} />
              <span className={styles.previewLine} />
              <span className={styles.previewChip} />
            </span>
          </span>

          <span className={styles.meta}>
            <span className={styles.texts}>
              <span className={styles.name}>{theme.label}</span>
              <span className={styles.desc}>{theme.description}</span>
            </span>

            <span className={styles.check} aria-hidden>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m5 12.5 4.5 4.5L19 7" />
              </svg>
            </span>
          </span>
        </span>
      </label>
    ))}
  </div>
);

export default ThemePicker;
