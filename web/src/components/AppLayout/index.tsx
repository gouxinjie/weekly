/**
 * @component 应用骨架
 * @description 登录后的统一骨架，同一套 DOM 承载两种骨架：
 * 桌面端（> 1023px）为左栏（logo + 纵向页签 + 账号区）+ 可选顶栏 + 左列 + 中栏 + 右栏；
 * 移动端（≤ 1023px）左栏落到底部变成横向页签栏，左列与右栏各自变成覆盖式抽屉，
 * 入口按钮由顶栏承担；没有顶栏的页面用导出的 MobileDrawerEntry 把它放进自己的标题行。
 * 周报态为「左列（时间轴）+ 中栏 + 右栏」，待办态为「左列（筛选）+ 中栏」，
 * 「待办」页签带未完成计数角标（M-09）
 * @author gouxinjie
 * @created 2026-09-18
 * @updated 2026-09-24
 */
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AccountFooter from '@/components/AccountFooter';
import {
  ROUTE_TRANSITION_EASING,
  ROUTE_TRANSITION_MS,
  ROUTE_TRANSITION_SHIFT_PX,
} from '@/constants';
import { useTodoCount } from '@/contexts/TodoCountContext';
import useIsMobile from '@/hooks/useIsMobile';
import { getCurrentWeek } from '@/utils/week';
import { isViewTransitionActive, navigateWithTransition } from '@/utils/routeTransition';
import styles from './index.module.scss';

/** 页签栏标签页标识 */
export type AppTab = 'weekly' | 'todo' | 'notes' | 'settings';

/** 页签定义：标识 + 文案 + 线性图标 */
interface TabItem {
  key: AppTab;
  label: string;
  /** 24×24 视图的图标路径 */
  icon: ReactNode;
}

/** 四个页签，顺序与设计稿一致 */
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
    key: 'notes',
    label: '便签',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M4.5 4.5h15V14l-4.5 4.5H4.5z" strokeLinejoin="round" />
        <path d="M19.5 14H15v4.5" strokeLinejoin="round" />
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
  /** 右栏是否收起，仅在传入 drawer 时生效，默认 false；移动端不看这个值，改由内部的抽屉状态接管 */
  drawerCollapsed?: boolean;
  /** 切换右栏收起状态的回调（移动端不调用，抽屉的开合由骨架内部管理） */
  onToggleDrawer?: () => void;
  /** 移动端左列抽屉的入口文案，默认「筛选」；周报态传「时间轴」 */
  leftColumnLabel?: string;
  /** 移动端右栏抽屉的入口文案，默认「详情」；文案要短，窄屏顶栏只放得下两个字 */
  drawerLabel?: string;
}

/** 抽屉入口上下文：两枚渲染好的入口按钮，供页面取用 */
interface MobileDrawerEntries {
  /** 左列抽屉入口；页面没有左列时为 null */
  leftEntry: ReactNode;
  /** 右栏抽屉入口；页面没有右栏时为 null */
  rightEntry: ReactNode;
}

/**
 * 抽屉入口上下文
 * @remarks 默认值是两枚 null：页面若在 AppLayout 之外使用 MobileDrawerEntry，静默渲染为空，
 * 而不是抛错——入口按钮属于锦上添花，不该因为没套骨架就让整页崩掉。
 */
const MobileDrawerContext = createContext<MobileDrawerEntries>({
  leftEntry: null,
  rightEntry: null,
});

/** MobileDrawerEntry 属性 */
interface MobileDrawerEntryProps {
  /** 打开哪一侧的抽屉：left 为左列（时间轴 / 筛选），right 为右栏（本周待办 / 插入面板） */
  side: 'left' | 'right';
}

/**
 * 移动端抽屉入口按钮
 * @param props - 见 MobileDrawerEntryProps
 * @returns 入口按钮节点；该侧没有抽屉时为空
 * @remarks 有顶栏的页面（周报）由骨架直接把入口放进顶栏；没有顶栏的页面（待办）用它把入口
 * 放进自己的标题行——否则骨架得单起一条只装一枚按钮的工具条，白占一行高度。
 * 按钮在桌面端由样式隐藏（display: none），两种骨架因此共用同一份 DOM。
 */
export const MobileDrawerEntry = ({ side }: MobileDrawerEntryProps) => {
  const { leftEntry, rightEntry } = useContext(MobileDrawerContext);
  return <>{side === 'left' ? leftEntry : rightEntry}</>;
};

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
  leftColumnLabel = '筛选',
  drawerLabel = '详情',
}: AppLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { undoneCount } = useTodoCount();
  const isMobile = useIsMobile();

  /*
   * 移动端两个覆盖式抽屉的开合状态。
   * 桌面端完全不读它们；页面传入的 drawerCollapsed 在移动端也不生效——
   * 桌面端习惯把右栏常驻展开，而手机上右栏必须先是收起的，否则一进周报就被一层浮层盖住。
   */
  const [mobileLeftOpen, setMobileLeftOpen] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  /** 内容区节点：路由切换时给它播入场动画 */
  const contentRef = useRef<HTMLDivElement | null>(null);

  /**
   * 路由切换过渡的降级路径
   * @remarks 支持 View Transitions 的浏览器走 utils/routeTransition 的交叉淡化，这里直接跳过；
   * 不支持时才由本段接手，给内容区播一段淡入。选 WAAPI（element.animate）而不是 CSS 动画：
   * 1. CSS 动画重播必须「置空 → 强制回流 → 还原」，那一次强制同步布局在周报这种大文档上会掉帧；
   *    WAAPI 每次调用都是一段新动画，天然可重播。
   * 2. 挂在 useLayoutEffect 而不是 useEffect：useEffect 在浏览器绘制之后才跑，
   *    新内容会先以完全不透明的状态闪一帧再淡入；useLayoutEffect 在绘制前跑，首帧即动画起点。
   * 3. 只动 opacity 与 transform：两者都能交给合成线程，不触发重排；且不重建子树，
   *    周报换周时编辑器实例与滚动位置都保留。
   * @returns 取消动画的清理函数
   */
  useLayoutEffect(() => {
    // 这次切换已由视图过渡负责（新旧快照交叉淡化），不要再叠一层淡入
    if (isViewTransitionActive()) return undefined;

    const element = contentRef.current;
    if (element === null) return undefined;
    // 系统开启「减少动态效果」时直接落位
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

    const animation = element.animate(
      [
        { opacity: 0, transform: `translateY(${ROUTE_TRANSITION_SHIFT_PX}px)` },
        { opacity: 1, transform: 'none' },
      ],
      { duration: ROUTE_TRANSITION_MS, easing: ROUTE_TRANSITION_EASING },
    );

    return () => {
      animation.cancel();
    };
  }, [location.pathname]);

  /**
   * 跳转到指定标签页
   * @param tab - 目标标签
   * @returns 无
   */
  const goTab = (tab: AppTab): void => {
    if (tab === 'weekly') {
      const current = getCurrentWeek();
      navigateWithTransition(navigate, `/weekly/${current.year}/${current.week}`);
      return;
    }
    navigateWithTransition(navigate, `/${tab}`);
  };

  /*
   * 移动端抽屉在路由切换时收起：换周、切标签页都会改 pathname，
   * 抽屉若留在打开状态，新页面会顶着一层遮罩登场，看上去像「点不动」。
   */
  useEffect(() => {
    setMobileLeftOpen(false);
    setMobileDrawerOpen(false);
  }, [location.pathname]);

  const hasDrawer = drawer !== undefined;
  const hasLeftColumn = leftColumn !== undefined;
  // 桌面端沿用页面传入的收起状态；移动端改由内部抽屉状态接管
  const drawerVisible = hasDrawer && (isMobile ? mobileDrawerOpen : !drawerCollapsed);

  /** 移动端左列抽屉是否展开（桌面端恒为 false，左列按常规列渲染） */
  const leftColumnExpanded = isMobile && mobileLeftOpen;

  /** 移动端是否有抽屉盖在内容之上：决定遮罩是否出现 */
  const backdropVisible = isMobile && (mobileLeftOpen || (hasDrawer && mobileDrawerOpen));

  /** 收起移动端的两个抽屉（点遮罩时调用） */
  const closeMobilePanes = (): void => {
    setMobileLeftOpen(false);
    setMobileDrawerOpen(false);
  };

  /*
   * 移动端的两枚抽屉入口按钮。
   * 有顶栏的页面（周报）由骨架把它们摆进顶栏；没有顶栏的页面（待办）通过
   * MobileDrawerEntry 取走放进自己的标题行——入口跟着页面标题走，比骨架单起一条
   * 只装一枚按钮的工具条更省一行高度，也不会在视觉上多切出一块。
   * 图标只是点缀，真正的语义由文案与 aria-label 承担；文案取两个字的短词，
   * 窄屏顶栏还要腾出位置给年份切换。桌面端由样式整体隐藏（display: none），
   * 因此两种骨架共用同一份节点。
   */
  const drawerEntries = useMemo<MobileDrawerEntries>(() => {
    /*
     * 两个入口都是开关而不是单向的「打开」：
     * 抽屉铺开时按钮仍露在遮罩之外（遮罩只盖内容行），用户很自然会再点一次想收起它；
     * 那时若什么都不发生，看起来就是按钮失灵。同时开另一侧前会先把这一侧关掉，保证一次只开一个。
     */
    const toggleLeft = (): void => {
      setMobileDrawerOpen(false);
      setMobileLeftOpen((prev) => !prev);
    };

    const toggleRight = (): void => {
      setMobileLeftOpen(false);
      setMobileDrawerOpen((prev) => !prev);
    };

    return {
      leftEntry: !hasLeftColumn ? null : (
        <button
          type="button"
          className={styles.mobileNavButton}
          onClick={toggleLeft}
          aria-label={mobileLeftOpen ? `收起${leftColumnLabel}` : `打开${leftColumnLabel}`}
          aria-expanded={mobileLeftOpen}
        >
          <span className={styles.mobileNavIcon} aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
              <path d="M4 6.5h16M4 12h11M4 17.5h16" strokeLinecap="round" />
            </svg>
          </span>
          {leftColumnLabel}
        </button>
      ),
      rightEntry: !hasDrawer ? null : (
        <button
          type="button"
          className={styles.mobileNavButton}
          onClick={toggleRight}
          aria-label={mobileDrawerOpen ? `收起${drawerLabel}` : `打开${drawerLabel}`}
          aria-expanded={mobileDrawerOpen}
        >
          <span className={styles.mobileNavIcon} aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
              <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
              <path d="M14.5 4.5v15" />
            </svg>
          </span>
          {drawerLabel}
        </button>
      ),
    };
    // 依赖只取布尔量、文案与开合状态：leftColumn / drawer 是每次渲染都可能换引用的节点，
    // 放进依赖数组会让这两枚按钮跟着页面内容一起重建
  }, [hasLeftColumn, hasDrawer, leftColumnLabel, drawerLabel, mobileLeftOpen, mobileDrawerOpen]);

  return (
    <div className={styles.root}>
      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <div className={styles.brand}>
            {/* 品牌标记：叶片图形放进主色实底圆角块，与选中页签同一套「主色实底」语言 */}
            <span className={styles.brandMark} aria-hidden>
              <svg className={styles.brandLeaf} viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 4c-9 0-14 3.6-14 10.2 0 1.2.3 2.3.8 3.2l-3.1 2.9 1.4 1.5 3.1-2.9c1 .6 2.1.9 3.3.9C18.2 19.8 20 14 20 4Zm-2.2 2.3c-.3 5.5-1.6 9-4.6 10.5-1.2.6-2 1-2.9 1.1l7.5-11.6Z" />
              </svg>
            </span>
            <span className={styles.brandText}>weekly</span>
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
                {/* 未完成计数角标（M-09）：只在待办页签、且确实有未完成条目时出现 */}
                {tab.key === 'todo' && undoneCount > 0 ? (
                  // 角标只有数字，补一段只给读屏软件的文案；aria-label 挂在没有角色的
                  // span 上不一定会被播报，用视觉隐藏的文字更可靠
                  <span className={styles.tabBadge}>
                    {undoneCount}
                    <span className={styles.srOnly}>条未完成</span>
                  </span>
                ) : null}
              </button>
            ))}
          </nav>

          <AccountFooter />
        </aside>

        <div className={styles.main}>
          {topbar !== undefined ? (
            <header className={styles.topbar}>
              {/* 有顶栏的页面（周报）：入口由骨架摆在顶栏最前面，靠左与年份切换连成一排 */}
              {drawerEntries.leftEntry}
              {drawerEntries.rightEntry}
              {topbar}
            </header>
          ) : null}

          <div className={styles.contentRow} ref={contentRef}>
            {/* 移动端遮罩：左列 / 右栏以覆盖层出现时点它收起 */}
            {backdropVisible ? (
              <div className={styles.backdrop} onClick={closeMobilePanes} role="presentation" />
            ) : null}

            {/* 左列：周报态为时间轴，待办态为筛选；桌面端是常驻一列，移动端是同名的覆盖式抽屉 */}
            {leftColumn !== undefined ? (
              <aside className={leftColumnExpanded ? styles.leftColumnOpen : styles.leftColumn}>
                {leftColumn}
              </aside>
            ) : null}

            <main className={styles.center}>
              {/*
                Provider 只包页面内容：顶栏那两枚入口由骨架自己渲染，而页面（待办）
                通过 MobileDrawerEntry 从内容里取用左列入口。它不产生 DOM，
                因此不影响 .center 的 flex 布局。
              */}
              <MobileDrawerContext.Provider value={drawerEntries}>
                {children}
              </MobileDrawerContext.Provider>
            </main>

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
