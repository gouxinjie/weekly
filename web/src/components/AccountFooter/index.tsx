/**
 * @component 底部账号区
 * @description 左栏底部的圆形头像、账号名与脱敏手机号；头像可点击，向上弹出账号菜单
 * （退出登录），退出与设置页一致走二次确认；两态位置一致不跳动
 * @author gouxinjie
 * @created 2026-09-18
 * @updated 2026-09-23
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useAuth } from '@/contexts/AuthContext';
import { maskPhone } from '@/utils/format';
import { navigateWithTransition } from '@/utils/routeTransition';
import styles from './index.module.scss';

/** 账号名占位：当前用户模型没有昵称字段，统一展示固定称呼 */
const ACCOUNT_NAME = 'weekly 用户';

/** 菜单与头像之间的间距 */
const MENU_GAP = 6;

/** 菜单宽度，必须与 index.module.scss 的 .menu 宽度一致，否则贴边时的横向收拢会算错 */
const MENU_WIDTH = 172;

/** 菜单距视口边缘的最小留白 */
const VIEWPORT_PADDING = 8;

/** 账号菜单定位结果（fixed 坐标：用 bottom 而非 top，菜单高度变化时始终贴着头像下沿） */
interface MenuPosition {
  /** 菜单底边距视口底部的距离 */
  bottom: number;
  /** 菜单左边距视口左侧的距离 */
  left: number;
}

/**
 * 计算账号菜单的定位
 * @param trigger - 头像按钮元素
 * @returns 定位结果；元素不存在时返回 null
 * @remarks 菜单向上弹出：账号区固定在页面底部，向下没有空间
 */
const computeMenuPosition = (trigger: HTMLElement | null): MenuPosition | null => {
  if (trigger === null) return null;

  const rect = trigger.getBoundingClientRect();
  const rightmost = window.innerWidth - MENU_WIDTH - VIEWPORT_PADDING;
  const left = Math.min(Math.max(rect.left, VIEWPORT_PADDING), Math.max(rightmost, VIEWPORT_PADDING));

  return {
    bottom: window.innerHeight - rect.top + MENU_GAP,
    left,
  };
};

/**
 * 底部账号区
 * @returns 账号区节点
 */
const AccountFooter = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // 菜单定位：展开时算一次，页面滚动或窗口尺寸变化时跟随更新
  useLayoutEffect(() => {
    if (!menuOpen) {
      setPosition(null);
      return undefined;
    }

    const update = (): void => setPosition(computeMenuPosition(triggerRef.current));
    update();

    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [menuOpen]);

  // 点击菜单与头像之外的区域时收起
  useEffect(() => {
    if (!menuOpen) return undefined;

    /**
     * 处理文档上的鼠标按下
     * @param event - 鼠标事件
     * @returns 无
     */
    const handlePointerDown = (event: MouseEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target) === true) return;
      if (menuRef.current?.contains(target) === true) return;
      setMenuOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [menuOpen]);

  /*
   * 菜单展开时把焦点移进第一个菜单项，关闭后交还头像按钮：
   * 键盘用户展开菜单后按回车即可退出，焦点也不会因为菜单项被卸载而掉到 body 上。
   */
  useEffect(() => {
    if (!menuOpen) return undefined;

    // 头像按钮组件生命周期内不会更换，这里取出节点而不是在清理函数里再读 ref
    const trigger = triggerRef.current;
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    return () => {
      trigger?.focus();
    };
  }, [menuOpen]);

  if (user === null) return null;

  /**
   * 菜单内的键盘交互
   * @param event - 键盘事件
   * @returns 无
   * @remarks Esc 与 Tab 都只是收起菜单：焦点由上面的清理函数交还头像按钮，
   *          不把焦点留在已被卸载的菜单项上
   */
  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      setMenuOpen(false);
    }
  };

  /**
   * 打开二次确认弹窗
   * @returns 无
   */
  const openSignOutConfirm = (): void => {
    setMenuOpen(false);
    setConfirmOpen(true);
  };

  /**
   * 确认后退出当前设备并回到登录页
   * @returns 无
   * @remarks 登出接口失败时 AuthContext 已清除本地登录态，路由守卫会重定向到登录页，
   *          因此不在此处重试，只把失败事实带过去提示，避免用户误以为已安全退出
   */
  const submitSignOut = async (): Promise<void> => {
    setPending(true);
    let notice = '';
    try {
      await signOut();
    } catch {
      notice = '已退出当前设备，但未能通知服务端，建议稍后重新登录确认';
    } finally {
      setPending(false);
      setConfirmOpen(false);
      navigateWithTransition(
        navigate,
        '/login',
        notice === '' ? { replace: true } : { replace: true, state: { message: notice } },
      );
    }
  };

  return (
    <div className={styles.footer} ref={rootRef}>
      <div className={styles.account}>
        {/* 头像即账号菜单入口：点击向上弹出菜单，两态位置不变 */}
        <button
          ref={triggerRef}
          type="button"
          className={menuOpen ? styles.avatarOpen : styles.avatar}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="账号菜单"
          title="账号菜单"
          onClick={() => setMenuOpen((prev) => !prev)}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false">
            <path d="M12 12.2a4.1 4.1 0 1 0 0-8.2 4.1 4.1 0 0 0 0 8.2Zm0 1.9c-3.6 0-7 1.9-7 4.4 0 .9.7 1.5 1.6 1.5h10.8c.9 0 1.6-.6 1.6-1.5 0-2.5-3.4-4.4-7-4.4Z" />
          </svg>
        </button>

        <span className={styles.texts}>
          <span className={styles.name}>{ACCOUNT_NAME}</span>
          <span className={styles.phone} title={user.phone}>
            {maskPhone(user.phone)}
          </span>
        </span>
      </div>

      {/* 菜单 portal 到 body：账号区在左栏底部，留在原地会被骨架的 overflow 裁剪 */}
      {menuOpen && position !== null
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label="账号菜单"
              className={styles.menu}
              style={{ bottom: position.bottom, left: position.left }}
              onKeyDown={handleMenuKeyDown}
            >
              <button
                type="button"
                role="menuitem"
                className={styles.menuItem}
                onClick={openSignOutConfirm}
              >
                <span className={styles.menuIcon} aria-hidden>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                    <path d="M15 5.5H7.5A2.5 2.5 0 0 0 5 8v8a2.5 2.5 0 0 0 2.5 2.5H15" strokeLinecap="round" />
                    <path d="M14 8.2 17.8 12 14 15.8M10.5 12h7.3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                退出登录
              </button>
            </div>,
            document.body,
          )
        : null}

      {/* 退出与设置页同一套二次确认文案，避免两处语气不一致 */}
      <ConfirmDialog
        open={confirmOpen}
        title="退出登录？"
        description="将清除当前设备的登录状态，下次访问需要重新登录。"
        confirmText="退出登录"
        tone="danger"
        pending={pending}
        onConfirm={() => void submitSignOut()}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
};

export default AccountFooter;
