/**
 * @component 应用骨架
 * @description 登录后的统一骨架：左栏（logo + 纵向页签 + 内容 + 账号区），右侧可选顶栏与右栏抽屉；
 * 周报态三栏、备忘态两栏，左栏宽度两态一致、切换不跳动
 * @author gouxinjie
 * @created 2026-09-18
 * @updated 2026-09-20
 */
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import AccountFooter from '@/components/AccountFooter';
import { getCurrentWeek } from '@/utils/week';
import styles from './index.module.scss';

/** 左栏标签页标识 */
export type AppTab = 'weekly' | 'memo' | 'settings';

/** 页签定义：标识 + 文案 + 线性图标 */
interface TabItem {
  key: AppTab;
  label: string;
  /** 24×24 视图的图标路径 */
  icon: ReactNode;
}

/** 三个页签，顺序与设计稿一致 */
const TABS: TabItem[] = [
  {
    key: 'weekly',
    label: '周报',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="4" y="4" width="16" height="16" rx="3" />
        <path d="M8 9h8M8 13h5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: 'memo',
    label: '备忘',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="4" y="4" width="16" height="16" rx="3" />
        <path d="m8.5 12 2.4 2.4 4.6-4.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    key: 'settings',
    label: '设置',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="3.2" />
        <path d="M12 3v2.4M12 18.6V21M3 12h2.4M18.6 12H21M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7" strokeLinecap="round" />
      </svg>
    ),
  },
];

/** AppLayout 属性 */
interface AppLayoutProps {
  /** 当前激活的标签页，决定左栏页签高亮项 */
  activeTab: AppTab;
  /** 左栏页签下方的内容：周报态是时间轴树，备忘 / 设置态为空 */
  sidebar?: ReactNode;
  /** 可选顶栏：渲染在中栏与右栏之上（周报展示态的年份 / 搜索 / 通知条） */
  topbar?: ReactNode;
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
  topbar,
  children,
  drawer,
  drawerCollapsed = false,
  onToggleDrawer,
}: AppLayoutProps) => {
  const navigate = useNavigate();

  /**
   * 跳转到指定标签页
   * @param tab - 目标标签
   * @returns 无
   */
  const goTab = (tab: AppTab): void => {
    if (tab === 'weekly') {
      const current = getCurrentWeek();
      navigate(`/weekly/${current.year}/${current.week}`);
      return;
    }
    navigate(`/${tab}`);
  };

  const hasDrawer = drawer !== undefined;
  const drawerVisible = hasDrawer && !drawerCollapsed;

  return (
    <div className={styles.root}>
      {/* 窄屏降级提示：只保证桌面端，不做移动端布局 */}
      <div className={styles.narrowNotice}>请在桌面端使用（建议视口宽度不少于 1024px）</div>

      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <div className={styles.brand}>
            weekly<span className={styles.brandLeaf}>❧</span>
          </div>

          <nav className={styles.tabs}>
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={activeTab === tab.key ? styles.tabActive : styles.tab}
                onClick={() => goTab(tab.key)}
              >
                <span className={styles.tabIcon}>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>

          {sidebar !== undefined ? <div className={styles.sidebarBody}>{sidebar}</div> : null}

          <AccountFooter />
        </aside>

        <div className={styles.main}>
          {topbar !== undefined ? <header className={styles.topbar}>{topbar}</header> : null}

          <div className={styles.contentRow}>
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
      </div>
    </div>
  );
};

export default AppLayout;
