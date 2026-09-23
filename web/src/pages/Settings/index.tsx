/**
 * @component 设置页
 * @description 应用骨架内的单列居中布局：外观（主题切换）、账号信息、
 * 账号安全（修改密码 / 退出所有设备）、系统信息与通栏退出登录按钮；
 * 修改密码以弹窗收集原密码与新密码，修改密码、退出登录与退出所有设备均为敏感操作，统一走二次确认弹窗
 * @author gouxinjie
 * @created 2026-09-18
 * @updated 2026-09-23
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import ConfirmDialog from '@/components/ConfirmDialog';
import type { ConfirmTone } from '@/components/ConfirmDialog';
import PasswordDialog from '@/components/PasswordDialog';
import type { PasswordFormValue } from '@/components/PasswordDialog';
import ThemePicker from '@/components/ThemePicker';
import { CONTACT_PHONE } from '@/constants';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { maskPhone } from '@/utils/format';
import styles from './index.module.scss';

/** 应用版本号：与 package.json 保持一致 */
const APP_VERSION = 'v1.0.0';

/** 账号名占位：当前用户模型没有昵称字段，统一展示固定称呼 */
const ACCOUNT_NAME = 'weekly 用户';

/** 需要二次确认的敏感操作标识 */
type ConfirmTarget = 'password' | 'signOutAll' | 'signOut';

/** 二次确认弹窗的文案与语气定义 */
interface ConfirmContent {
  /** 弹窗标题 */
  title: string;
  /** 后果说明 */
  description: string;
  /** 确认按钮文案 */
  confirmText: string;
  /** 语气：不可逆操作用 danger */
  tone: ConfirmTone;
}

/** 各敏感操作的二次确认文案，集中在此便于统一语气 */
const CONFIRM_CONTENT: Record<ConfirmTarget, ConfirmContent> = {
  password: {
    title: '确认修改密码？',
    description: '修改成功后，其他设备上的登录会立即失效，需要用新密码重新登录。',
    confirmText: '确认修改',
    tone: 'default',
  },
  signOutAll: {
    title: '退出所有设备？',
    description: '包括当前设备在内的全部登录状态都会被清除，再次访问需要重新输入手机号与密码。',
    confirmText: '全部退出',
    tone: 'danger',
  },
  signOut: {
    title: '退出登录？',
    description: '将清除当前设备的登录状态，下次访问需要重新登录。',
    confirmText: '退出登录',
    tone: 'danger',
  },
};

/** 行尾箭头属性 */
interface ChevronIconProps {
  /** 箭头类名：展开态传入带旋转的类，收起态传入基础类 */
  className: string;
}

/**
 * 行尾箭头图标
 * @param props - 见 ChevronIconProps
 * @returns 箭头图标节点
 * @remarks 与 Tree 的折叠箭头同一做法：用 SVG 折线而不是「›」字符——
 *          字符的字形、基线与粗细随字体变化，旋转 90° 后还会偏离视觉中心。
 */
const ChevronIcon = ({ className }: ChevronIconProps) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="m9 6 6 6-6 6" />
  </svg>
);

/**
 * 设置页
 * @returns 页面节点
 */
const Settings = () => {
  const { user, signOut, signOutAll, updatePassword } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();

  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordDraft, setPasswordDraft] = useState<PasswordFormValue | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(null);
  const [confirmPending, setConfirmPending] = useState(false);

  /** 打开修改密码弹窗，同时清掉上一次的反馈 */
  const openPasswordDialog = (): void => {
    setError('');
    setSuccess('');
    setPasswordOpen(true);
  };

  /** 关闭修改密码弹窗：主动关闭时丢弃暂存内容，下次打开是干净的空表单 */
  const closePasswordDialog = (): void => {
    setPasswordDraft(null);
    setPasswordOpen(false);
  };

  /**
   * 弹窗内校验通过后：暂存填写内容并拉起二次确认
   * @param value - 弹窗回填的三个密码字段
   * @returns 无
   * @remarks 弹窗此时关闭，内容暂存到 passwordDraft；
   *          二次确认被取消时重新打开弹窗并用它回填，用户不必重新输入
   */
  const handlePasswordSubmit = (value: PasswordFormValue): void => {
    setError('');
    setSuccess('');
    setPasswordDraft(value);
    setPasswordOpen(false);
    setConfirmTarget('password');
  };

  /** 确认后真正提交修改密码 */
  const submitPasswordChange = async (): Promise<void> => {
    // 二次确认只可能由弹窗提交产生，这里理论上有值；取不到时直接结束，避免空提交
    if (passwordDraft === null) return;

    const { oldPassword, newPassword } = passwordDraft;
    setConfirmPending(true);
    try {
      await updatePassword({ oldPassword, newPassword });
      setPasswordDraft(null);
      setSuccess('密码已更新，其他设备的登录已失效');
    } catch (err) {
      setError(err instanceof Error ? err.message : '修改密码失败，请稍后重试');
    } finally {
      setConfirmPending(false);
      setConfirmTarget(null);
    }
  };

  /**
   * 确认后退出当前设备并回到登录页
   * @returns 无
   * @remarks 登出接口失败时 AuthContext 已清除本地登录态，本页会被守卫重定向，
   *          所以不在此处重试，只把失败事实带登录页提示，避免用户误以为已安全退出
   */
  const submitSignOut = async (): Promise<void> => {
    setConfirmPending(true);
    let notice = '';
    try {
      await signOut();
    } catch {
      notice = '已退出当前设备，但未能通知服务端，建议稍后重新登录确认';
    } finally {
      setConfirmPending(false);
      setConfirmTarget(null);
      navigate(
        '/login',
        notice === '' ? { replace: true } : { replace: true, state: { message: notice } },
      );
    }
  };

  /**
   * 确认后退出所有设备并回到登录页
   * @returns 无
   * @remarks 只有接口确实成功才提示「已登出所有设备」；
   *          失败时不能沿用该文案，否则用户会误以为其他设备都已下线
   */
  const submitSignOutAll = async (): Promise<void> => {
    setConfirmPending(true);
    let notice = '已登出所有设备';
    try {
      await signOutAll();
    } catch {
      notice = '已退出当前设备，但未清除其他设备，请重新登录后再试';
    } finally {
      setConfirmPending(false);
      setConfirmTarget(null);
      navigate('/login', { replace: true, state: { message: notice } });
    }
  };

  /** 二次确认弹窗的确认回调，按当前操作分发 */
  const handleConfirm = (): void => {
    if (confirmTarget === 'password') {
      void submitPasswordChange();
      return;
    }
    if (confirmTarget === 'signOutAll') {
      void submitSignOutAll();
      return;
    }
    void submitSignOut();
  };

  /** 关闭二次确认弹窗；处理中不允许关闭 */
  const handleCancelConfirm = (): void => {
    if (confirmPending) return;
    // 取消改密确认时回到填写弹窗，passwordDraft 会作为初值回填
    if (confirmTarget === 'password') setPasswordOpen(true);
    setConfirmTarget(null);
  };

  return (
    <AppLayout activeTab="settings">
      <div className={styles.page}>
        <div className={styles.panel}>
          <header className={styles.header}>
            <h1 className={styles.title}>设置</h1>
            <p className={styles.subtitle}>管理外观主题、账号安全与查看数据存储信息</p>
          </header>

          {/* 外观：主题只存本机，切换后立即生效，不走服务端 */}
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>外观</h2>
            <p className={styles.cardDesc}>主题保存在本机浏览器，换设备或换浏览器需重新选择</p>
            <ThemePicker value={theme} onChange={setTheme} />
          </section>

          {/* 账号信息 */}
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>账号信息</h2>
            <div className={styles.profile}>
              <span className={styles.avatar} aria-hidden>
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 12.2a4.1 4.1 0 1 0 0-8.2 4.1 4.1 0 0 0 0 8.2Zm0 1.9c-3.6 0-7 1.9-7 4.4 0 .9.7 1.5 1.6 1.5h10.8c.9 0 1.6-.6 1.6-1.5 0-2.5-3.4-4.4-7-4.4Z" />
                </svg>
              </span>
              <div className={styles.profileTexts}>
                <span className={styles.profileName}>{ACCOUNT_NAME}</span>
                <span className={styles.profilePhone}>
                  {user === null ? '' : maskPhone(user.phone)}
                </span>
              </div>
              {/* 用户信息尚未就绪时不显示角标，避免出现「空手机号 + 已登录」的矛盾状态 */}
              {user !== null ? <span className={styles.profileState}>已登录</span> : null}
            </div>
          </section>

          {/* 账号安全：修改密码与退出所有设备均为敏感操作，点击后二次确认 */}
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>账号安全</h2>

            <button
              type="button"
              className={styles.actionRow}
              onClick={openPasswordDialog}
              aria-haspopup="dialog"
            >
              <span className={styles.actionIcon} aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <rect x="4.5" y="10" width="15" height="10.5" rx="2.5" />
                  <path d="M8 10V7.6a4 4 0 0 1 8 0V10" strokeLinecap="round" />
                  <path d="M12 14.4v2.2" strokeLinecap="round" />
                </svg>
              </span>
              <span className={styles.actionTexts}>
                <span className={styles.actionLabel}>修改密码</span>
                <span className={styles.actionDesc}>需验证原密码，修改后其他设备会退出登录</span>
              </span>
              <ChevronIcon className={styles.chevron} />
            </button>

            <button
              type="button"
              className={styles.actionRow}
              onClick={() => setConfirmTarget('signOutAll')}
            >
              <span className={styles.actionIcon} aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <rect x="2.8" y="4.5" width="12.6" height="9.2" rx="2" />
                  <path d="M6.6 18.2h5.4M9.1 13.7v4.5" strokeLinecap="round" />
                  <rect x="17.2" y="9.2" width="4.4" height="10.3" rx="1.5" />
                </svg>
              </span>
              <span className={styles.actionTexts}>
                <span className={styles.actionLabel}>退出所有设备</span>
                <span className={styles.actionDesc}>一次性清除全部设备的登录状态</span>
              </span>
              <ChevronIcon className={styles.chevron} />
            </button>

            {/* 改密结果反馈：弹窗关闭后在此提示，失败为 alert、成功为 status */}
            {error !== '' ? (
              <p className={styles.bannerError} role="alert">
                {error}
              </p>
            ) : null}
            {success !== '' ? (
              <p className={styles.bannerSuccess} role="status">
                {success}
              </p>
            ) : null}
          </section>

          {/* 系统信息 */}
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>系统信息</h2>
            <dl className={styles.infoList}>
              <div className={styles.infoRow}>
                <dt className={styles.infoLabel}>版本号</dt>
                <dd className={styles.infoValue}>{APP_VERSION}</dd>
              </div>
              <div className={styles.infoRow}>
                <dt className={styles.infoLabel}>当前访问地址</dt>
                <dd className={styles.infoValue}>{window.location.host}</dd>
              </div>
              <div className={styles.infoRow}>
                <dt className={styles.infoLabel}>数据库存储</dt>
                <dd className={styles.infoValue}>SQLite（data/weekly.db）</dd>
              </div>
            </dl>
            <p className={styles.note}>
              数据保存在服务端 SQLite 文件中，建议随 ECS 快照一起备份。忘记密码请联系{' '}
              {CONTACT_PHONE}，人工核对后重置。
            </p>
          </section>

          {/* 通栏退出登录按钮 */}
          <button
            type="button"
            className={styles.logout}
            onClick={() => setConfirmTarget('signOut')}
          >
            退出登录
          </button>
        </div>
      </div>

      {/* 修改密码：弹窗收集密码，校验通过后再交给二次确认，两者不同时出现 */}
      {passwordOpen ? (
        <PasswordDialog
          open
          initialValue={passwordDraft ?? undefined}
          onSubmit={handlePasswordSubmit}
          onCancel={closePasswordDialog}
        />
      ) : null}

      {/* 敏感操作的二次确认：同一时刻只会有一个 */}
      {confirmTarget !== null ? (
        <ConfirmDialog
          open
          title={CONFIRM_CONTENT[confirmTarget].title}
          description={CONFIRM_CONTENT[confirmTarget].description}
          confirmText={CONFIRM_CONTENT[confirmTarget].confirmText}
          tone={CONFIRM_CONTENT[confirmTarget].tone}
          pending={confirmPending}
          onConfirm={handleConfirm}
          onCancel={handleCancelConfirm}
        />
      ) : null}
    </AppLayout>
  );
};

export default Settings;
