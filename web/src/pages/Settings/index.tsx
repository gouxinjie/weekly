/**
 * @component 设置页
 * @description 单列居中布局（宽 480px），包含修改密码、登出与登出所有设备、数据备份说明
 * @author gouxinjie
 * @created 2026-09-18
 * @updated 2026-09-18
 */
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { CONTACT_PHONE } from '@/constants';
import { useAuth } from '@/contexts/AuthContext';
import { maskPhone } from '@/utils/format';
import styles from './index.module.scss';

/** 密码强度：必须同时含数字与字母，长度不少于 8 位 */
const PASSWORD_PATTERN = /^(?=.*[0-9])(?=.*[a-zA-Z]).{8,}$/;

/**
 * 设置页
 * @returns 页面节点
 */
const Settings = () => {
  const { user, signOut, signOutAll, updatePassword } = useAuth();
  const navigate = useNavigate();

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

  /** 登出当前设备 */
  const handleSignOut = async (): Promise<void> => {
    await signOut();
    navigate('/login', { replace: true });
  };

  /** 登出所有设备：跳到登录页并带上提示 */
  const handleSignOutAll = async (): Promise<void> => {
    await signOutAll();
    navigate('/login', { replace: true, state: { message: '已登出所有设备' } });
  };

  return (
    <div className={styles.page}>
      <div className={styles.panel}>
        <header className={styles.header}>
          <button type="button" className={styles.back} onClick={() => navigate('/weekly')}>
            ← 返回
          </button>
          <h1 className={styles.title}>设置</h1>
        </header>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>账号</h2>
          <p className={styles.row}>
            <span className={styles.rowLabel}>手机号</span>
            <span className={styles.rowValue}>{user === null ? '' : maskPhone(user.phone)}</span>
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>修改密码</h2>
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
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>登录状态</h2>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => void handleSignOut()}
            >
              登出当前设备
            </button>
            <button
              type="button"
              className={styles.danger}
              onClick={() => void handleSignOutAll()}
            >
              登出所有设备
            </button>
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>数据与备份</h2>
          <p className={styles.note}>
            数据存放于服务器的 SQLite 文件 <code>data/weekly.db</code>，即唯一数据源。
          </p>
          <p className={styles.note}>
            备份必须在服务运行时用 <code>VACUUM INTO</code> 生成一致性快照，不要直接复制文件：
          </p>
          <pre className={styles.code}>
            {`sqlite3 data/weekly.db "VACUUM INTO 'backup/weekly-$(date +%F).db'"`}
          </pre>
          <p className={styles.note}>
            恢复方式：停服务 → 用备份文件覆盖 <code>data/weekly.db</code> → 删除残留的{' '}
            <code>-wal</code> / <code>-shm</code> → 启服务。
          </p>
          <p className={styles.note}>忘记密码请联系 {CONTACT_PHONE}，人工核对后重置。</p>
        </section>
      </div>
    </div>
  );
};

export default Settings;
