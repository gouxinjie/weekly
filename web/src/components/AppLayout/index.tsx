/**
 * @component 应用骨架
 * @description 登录后唯一的两种骨架：周报态三栏、备忘态两栏；左栏宽度两态一致、切换不跳动
 * @author gouxinjie
 * @created 2026-09-18
 * @updated 2026-09-18
 */
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import AccountFooter from '@/components/AccountFooter';
import { getCurrentWeek } from '@/utils/week';
import styles from './index.module.scss';

/** 左栏标签页标识 */
export type AppTab = 'weekly' | 'memo';

/** AppLayout 属性 */
interface AppLayoutProps {
  /** 当前激活的标签页，决定左栏页签高亮项 */
  activeTab: AppTab;
  /** 左栏页签下方的内容：周报态是两层树，备忘态是筛选器 */
  sidebar: ReactNode;
  /** 中栏内容 */
  children: ReactNode;
  /** 右栏内容；备忘态不传，此栏整栏移除而不是收起 */
  drawer?: ReactNode;
  /** 右栏是否收起，仅在传入 drawer 时生效，默认 false */
  drawerCollapsed?: boolean;
  /** 切换右栏收起状态的回调 */
  onToggleDrawer?: () => void;
}

/**
 * 应用骨架
 * @param props - 见 AppLayoutProps
 * @returns 两态骨架节点
 */
const AppLayout = ({
  activeTab,
  sidebar,
  children,
  drawer,
  drawerCollapsed = false,
  onToggleDrawer,
}: AppLayoutProps) => {
  const navigate = useNavigate();

  /** 跳转到周报态（当前 ISO 周） */
  const goWeekly = (): void => {
    const current = getCurrentWeek();
    navigate(`/weekly/${current.year}/${current.week}`);
  };

  /** 跳转到备忘态 */
  const goMemo = (): void => {
    navigate('/memo');
  };

  const hasDrawer = drawer !== undefined;
  const drawerVisible = hasDrawer && !drawerCollapsed;

  return (
    <div className={styles.root}>
      {/* 窄屏降级提示：只保证桌面端，不做移动端布局 */}
      <div className={styles.narrowNotice}>请在桌面端使用（建议视口宽度不少于 1024px）</div>

      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <nav className={styles.tabs}>
            <button
              type="button"
              className={activeTab === 'weekly' ? styles.tabActive : styles.tab}
              onClick={goWeekly}
            >
              周报
            </button>
            <button
              type="button"
              className={activeTab === 'memo' ? styles.tabActive : styles.tab}
              onClick={goMemo}
            >
              备忘
            </button>
          </nav>

          <div className={styles.sidebarBody}>{sidebar}</div>

          <AccountFooter />
        </aside>

        <main className={styles.center}>{children}</main>

        {hasDrawer ? (
          drawerVisible ? (
            <aside className={styles.drawer}>
              <button
                type="button"
                className={styles.drawerToggle}
                onClick={onToggleDrawer}
                aria-label="收起右栏"
                title="收起右栏"
              >
                ›
              </button>
              <div className={styles.drawerBody}>{drawer}</div>
            </aside>
          ) : (
            <aside className={styles.drawerCollapsed}>
              <button
                type="button"
                className={styles.drawerToggle}
                onClick={onToggleDrawer}
                aria-label="展开右栏"
                title="展开右栏"
              >
                ‹
              </button>
            </aside>
          )
        ) : null}
      </div>
    </div>
  );
};

export default AppLayout;
