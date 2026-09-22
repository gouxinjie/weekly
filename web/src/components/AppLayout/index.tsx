/**
 * @component 应用骨架
 * @description 登录后的统一骨架：左栏（logo + 纵向页签 + 内容 + 账号区），右侧可选顶栏、左列与右栏抽屉；
 * 周报态为「左栏 + 左列（时间轴）+ 中栏 + 右栏」，待办态为「左栏 + 左列（筛选）+ 中栏」，
 * 左栏与左列宽度两态一致、切换不跳动
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
export type AppTab = 'weekly' | 'todo' | 'settings';

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
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <rect x="3.5" y="5" width="17" height="15" rx="3" />
        <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: 'todo',
    label: '待办',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
        <path d="m8.2 12.2 2.5 2.5 5-5.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    key: 'settings',
    label: '设置',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.1 14.4a1.6 1.6 0 0 0 .3 1.8l.1.1a1.9 1.9 0 1 1-2.7 2.7l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5v.2a1.9 1.9 0 1 1-3.8 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a1.9 1.9 0 1 1-2.7-2.7l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a1.9 1.9 0 1 1 0-3.8h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a1.9 1.9 0 1 1 2.7-2.7l.1.1a1.6 1.6 0 0 0 1.8.3h.1a1.6 1.6 0 0 0 1-1.5V3a1.9 1.9 0 1 1 3.8 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a1.9 1.9 0 1 1 2.7 2.7l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5 1h.2a1.9 1.9 0 1 1 0 3.8h-.1a1.6 1.6 0 0 0-1.5 1Z" />
      </svg>
    ),
  },
];

/** AppLayout 属性 */
interface AppLayoutProps {
  /** 当前激活的标签页，决定左栏页签高亮项 */
  activeTab: AppTab;
  /** 可选左列：渲染在页签栏右侧、顶栏下方。周报态放时间轴树，待办态放筛选列表 */
  leftColumn?: ReactNode;
  /** 可选顶栏：渲染在左列与中栏之上（周报态的年份 / 搜索 / 通知条，编辑态与展示态都传） */
  topbar?: ReactNode;
  /** 中栏内容 */
  children: ReactNode;
  /** 右栏内容；待办态不传，此栏整栏移除而不是收起 */
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
  leftColumn,
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
            weekly
            {/* 叶片标记：与登录页同一图形 */}
            <svg className={styles.brandLeaf} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M20 4c-9 0-14 3.6-14 10.2 0 1.2.3 2.3.8 3.2l-3.1 2.9 1.4 1.5 3.1-2.9c1 .6 2.1.9 3.3.9C18.2 19.8 20 14 20 4Zm-2.2 2.3c-.3 5.5-1.6 9-4.6 10.5-1.2.6-2 1-2.9 1.1l7.5-11.6Z" />
            </svg>
          </div>

          <nav className={styles.tabs}>
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={activeTab === tab.key ? styles.tabActive : styles.tab}
                onClick={() => goTab(tab.key)}
                aria-current={activeTab === tab.key ? 'page' : undefined}
              >
                <span className={styles.tabIcon}>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>

          <AccountFooter />
        </aside>

        <div className={styles.main}>
          {topbar !== undefined ? <header className={styles.topbar}>{topbar}</header> : null}

          <div className={styles.contentRow}>
            {/* 左列：周报态为时间轴，待办态为筛选；周报态的年份切换正好压在它上方 */}
            {leftColumn !== undefined ? (
              <aside className={styles.leftColumn}>{leftColumn}</aside>
            ) : null}

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
