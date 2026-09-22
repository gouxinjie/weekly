/**
 * @component 设置页
 * @description 应用骨架内的单列布局：账号信息卡、账号安全（修改密码 / 退出登录）、
 * 系统信息与通栏退出登录按钮
 * @author gouxinjie
 * @created 2026-09-18
 * @updated 2026-09-20
 */
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { CONTACT_PHONE } from '@/constants';
import { useAuth } from '@/contexts/AuthContext';
import { maskPhone } from '@/utils/format';
import styles from './index.module.scss';

/** 密码强度：必须同时含数字与字母，长度不少于 8 位 */
const PASSWORD_PATTERN = /^(?=.*[0-9])(?=.*[a-zA-Z]).{8,}$/;

/** 应用版本号：与 package.json 保持一致 */
const APP_VERSION = 'v1.0.0';

/**
 * 设置页
 * @returns 页面节点
 */
const Settings = () => {
  const { user, signOut, signOutAll, updatePassword } = useAuth();
  const navigate = useNavigate();

  const [passwordOpen, setPasswordOpen] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [pending, setPending] = useState(false);

  /**
   * 提交修改密码
   * @param event - 表单提交事件
   * @returns 无
   */
  const handleChangePassword = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (oldPassword === '') {
      setError('请输入原密码');
      return;
    }
    if (!PASSWORD_PATTERN.test(newPassword)) {
      setError('新密码需包含数字与字母，且长度不少于 8 位');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致');
      return;
    }

    setPending(true);
    try {
      await updatePassword({ oldPassword, newPassword });
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess('密码已更新，其他设备的登录已失效');
    } catch (err) {
      setError(err instanceof Error ? err.message : '修改密码失败，请稍后重试');
    } finally {
      setPending(false);
    }
  };

  /** 退出登录（当前设备）：回到登录页 */
  const handleSignOut = async (): Promise<void> => {
    await signOut();
    navigate('/login', { replace: true });
  };

  /** 退出所有设备：回到登录页并带上提示 */
  const handleSignOutAll = async (): Promise<void> => {
    await signOutAll();
    navigate('/login', { replace: true, state: { message: '已登出所有设备' } });
  };

  return (
    <AppLayout activeTab="settings">
      <div className={styles.page}>
        <div className={styles.panel}>
          <h1 className={styles.title}>设置</h1>

          {/* 账号信息 */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>账号信息</h2>
            <div className={styles.profile}>
              <span className={styles.avatar} aria-hidden>
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 12.2a4.1 4.1 0 1 0 0-8.2 4.1 4.1 0 0 0 0 8.2Zm0 1.9c-3.6 0-7 1.9-7 4.4 0 .9.7 1.5 1.6 1.5h10.8c.9 0 1.6-.6 1.6-1.5 0-2.5-3.4-4.4-7-4.4Z" />
                </svg>
              </span>
              <div className={styles.profileTexts}>
                <span className={styles.profileName}>weekly 用户</span>
                <span className={styles.profilePhone}>
                  {user === null ? '' : maskPhone(user.phone)}
                </span>
              </div>
            </div>
          </section>

          {/* 账号安全 */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>账号安全</h2>

            <button
              type="button"
              className={styles.rowButton}
              onClick={() => setPasswordOpen(!passwordOpen)}
              aria-expanded={passwordOpen}
            >
              <span>修改密码</span>
              <span className={passwordOpen ? styles.chevronOpen : styles.chevron}>›</span>
            </button>

            {passwordOpen ? (
              <form className={styles.form} onSubmit={(event) => void handleChangePassword(event)}>
                <label className={styles.field}>
                  <span className={styles.label}>原密码</span>
                  <input
                    className={styles.input}
                    type="password"
                    autoComplete="current-password"
                    value={oldPassword}
                    onChange={(event) => setOldPassword(event.target.value)}
                  />
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>新密码</span>
                  <input
                    className={styles.input}
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                  />
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>确认新密码</span>
                  <input
                    className={styles.input}
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                  />
                </label>

                <p className={styles.hint}>密码需包含数字与字母，长度不少于 8 位</p>
                {error !== '' ? <p className={styles.error}>{error}</p> : null}
                {success !== '' ? <p className={styles.success}>{success}</p> : null}

                <button type="submit" className={styles.primary} disabled={pending}>
                  {pending ? '提交中…' : '更新密码'}
                </button>
              </form>
            ) : null}

            <button
              type="button"
              className={styles.rowButton}
              onClick={() => void handleSignOutAll()}
              title="登出所有设备（包括当前设备）"
            >
              <span>退出所有设备</span>
              <span className={styles.chevron}>›</span>
            </button>
          </section>

          {/* 系统信息 */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>系统信息</h2>
            <p className={styles.row}>
              <span className={styles.rowLabel}>版本号</span>
              <span className={styles.rowValue}>{APP_VERSION}</span>
            </p>
            <p className={styles.row}>
              <span className={styles.rowLabel}>部署地址</span>
              <span className={styles.rowValue}>{window.location.host}</span>
            </p>
            <p className={styles.row}>
              <span className={styles.rowLabel}>数据库存储</span>
              <span className={styles.rowValue}>SQLite（data/weekly.db）</span>
            </p>
            <p className={styles.note}>忘记密码请联系 {CONTACT_PHONE}，人工核对后重置。</p>
          </section>

          {/* 通栏退出登录按钮 */}
          <button
            type="button"
            className={styles.logoutAll}
            onClick={() => void handleSignOut()}
          >
            退出登录
          </button>
        </div>
      </div>
    </AppLayout>
  );
};

export default Settings;
