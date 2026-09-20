/**
 * @component 底部账号区
 * @description 左栏底部的头像、脱敏手机号与登出入口，两态位置一致不跳动
 * @author gouxinjie
 * @created 2026-09-18
 * @updated 2026-09-20
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { maskPhone } from '@/utils/format';
import styles from './index.module.scss';

/**
 * 底部账号区
 * @returns 账号区节点
 */
const AccountFooter = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);

  /**
   * 登出并返回登录页
   * @returns 无
   */
  const handleSignOut = async (): Promise<void> => {
    setPending(true);
    try {
      await signOut();
      navigate('/login', { replace: true });
    } finally {
      setPending(false);
    }
  };

  if (user === null) return null;

  return (
    <div className={styles.footer}>
      {/* 头像：主色圆底 + 用户剪影 */}
      <span className={styles.avatar} aria-hidden>
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 12.2a4.1 4.1 0 1 0 0-8.2 4.1 4.1 0 0 0 0 8.2Zm0 1.9c-3.6 0-7 1.9-7 4.4 0 .9.7 1.5 1.6 1.5h10.8c.9 0 1.6-.6 1.6-1.5 0-2.5-3.4-4.4-7-4.4Z" />
        </svg>
      </span>

      <span className={styles.phone} title={user.phone}>
        {maskPhone(user.phone)}
      </span>

      <button
        type="button"
        className={styles.logout}
        onClick={() => void handleSignOut()}
        disabled={pending}
        title="登出"
      >
        登出
      </button>
    </div>
  );
};

export default AccountFooter;
