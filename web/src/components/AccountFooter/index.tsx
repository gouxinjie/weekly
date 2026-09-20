/**
 * @component 底部账号区
 * @description 左栏底部的手机号（脱敏）与设置、登出入口，两态位置一致不跳动
 * @author gouxinjie
 * @created 2026-09-18
 * @updated 2026-09-18
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
      <span className={styles.phone} title={user.phone}>
        {maskPhone(user.phone)}
      </span>

      <div className={styles.actions}>
        <button type="button" className={styles.action} onClick={() => navigate('/settings')}>
          设置
        </button>
        <button
          type="button"
          className={styles.action}
          onClick={() => void handleSignOut()}
          disabled={pending}
        >
          登出
        </button>
      </div>
    </div>
  );
};

export default AccountFooter;
