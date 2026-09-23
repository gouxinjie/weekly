/**
 * @component 底部账号区
 * @description 左栏底部的圆形头像、账号名与脱敏手机号；
 * 两态位置一致不跳动
 * @author gouxinjie
 * @created 2026-09-18
 * @updated 2026-09-23
 */
import { useAuth } from '@/contexts/AuthContext';
import { maskPhone } from '@/utils/format';
import styles from './index.module.scss';

/** 账号名占位：当前用户模型没有昵称字段，统一展示固定称呼 */
const ACCOUNT_NAME = 'weekly 用户';

/**
 * 底部账号区
 * @returns 账号区节点
 */
const AccountFooter = () => {
  const { user } = useAuth();

  if (user === null) return null;

  return (
    <div className={styles.footer}>
      <div className={styles.account}>
        {/* 头像：浅色圆底 + 用户剪影 */}
        <span className={styles.avatar} aria-hidden>
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 12.2a4.1 4.1 0 1 0 0-8.2 4.1 4.1 0 0 0 0 8.2Zm0 1.9c-3.6 0-7 1.9-7 4.4 0 .9.7 1.5 1.6 1.5h10.8c.9 0 1.6-.6 1.6-1.5 0-2.5-3.4-4.4-7-4.4Z" />
          </svg>
        </span>

        <span className={styles.texts}>
          <span className={styles.name}>{ACCOUNT_NAME}</span>
          <span className={styles.phone} title={user.phone}>
            {maskPhone(user.phone)}
          </span>
        </span>
      </div>
    </div>
  );
};

export default AccountFooter;
