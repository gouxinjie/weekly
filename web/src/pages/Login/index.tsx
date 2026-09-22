/**
 * @component 登录 / 注册页
 * @description 全屏风景背景上的独立布局：左侧品牌视觉区（品牌名 + 标语 + 三个特性），
 * 右上角品牌口号，右侧悬浮白色登录卡片；登录 / 注册两页签切换，支持记住账号
 * @author gouxinjie
 * @created 2026-09-18
 * @updated 2026-09-22
 */
import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import loginBg from '@/assets/login-bg.jpg';
import { CONTACT_PHONE, REMEMBER_PHONE_KEY } from '@/constants';
import { useAuth } from '@/contexts/AuthContext';
import styles from './index.module.scss';

/** 两种表单模式 */
type FormMode = 'login' | 'register';

/** 手机号格式：中国大陆 11 位 */
const PHONE_PATTERN = /^1[3-9]\d{9}$/;

/** 密码强度：必须同时含数字与字母，长度不少于 8 位 */
const PASSWORD_PATTERN = /^(?=.*[0-9])(?=.*[a-zA-Z]).{8,}$/;

/** 品牌叶片：与左栏 logo 同款图形 */
const LeafIcon = () => (
  <svg className={styles.brandLeaf} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M20 4c-9 0-14 3.6-14 10.2 0 1.2.3 2.3.8 3.2l-3.1 2.9 1.4 1.5 3.1-2.9c1 .6 2.1.9 3.3.9C18.2 19.8 20 14 20 4Zm-2.2 2.3c-.3 5.5-1.6 9-4.6 10.5-1.2.6-2 1-2.9 1.1l7.5-11.6Z" />
  </svg>
);

/** 左侧品牌区的三个特性点：线性图标 + 标题 + 说明 */
interface FeatureItem {
  /** 特性标题 */
  title: string;
  /** 特性说明 */
  desc: string;
  /** 24×24 视图的线性图标 */
  icon: ReactNode;
}

const FEATURES: FeatureItem[] = [
  {
    title: '周报',
    desc: '时间轴记录',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <rect x="3.5" y="5" width="17" height="15" rx="3" />
        <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: '备忘',
    desc: '待办清单',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
        <path d="m8.2 12.2 2.5 2.5 5-5.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: '多用户',
    desc: '数据隔离',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <circle cx="10" cy="8.5" r="3.2" />
        <path d="M3.8 19.2c0-3 2.8-5 6.2-5s6.2 2 6.2 5" strokeLinecap="round" />
        <path d="M16.4 6.1a3 3 0 0 1 0 5.6M18.2 19.2c0-2.2-.7-3.8-1.9-4.8" strokeLinecap="round" />
      </svg>
    ),
  },
];

/**
 * 读取重定向来源
 * @param state - 路由 state，类型为 unknown，需要收窄
 * @returns 合法的站内路径，非法时返回根路径
 */
const readRedirectFrom = (state: unknown): string => {
  if (typeof state === 'object' && state !== null && 'from' in state) {
    const value = (state as { from: unknown }).from;
    if (typeof value === 'string' && value.startsWith('/')) return value;
  }
  return '/';
};

/**
 * 读取跳转携带的提示文案
 * @param state - 路由 state，类型为 unknown，需要收窄
 * @returns 提示文案，不存在时返回空字符串
 * @remarks 跨区域的短反馈（如「已登出所有设备」）在跳转后无法用 Toast 展示，改用 state 传递
 */
const readNotice = (state: unknown): string => {
  if (typeof state === 'object' && state !== null && 'message' in state) {
    const value = (state as { message: unknown }).message;
    if (typeof value === 'string') return value;
  }
  return '';
};

/**
 * 读取「记住账号」记录的手机号
 * @returns 已记录的手机号，无记录时返回空串
 */
const readRememberedPhone = (): string => {
  try {
    return window.localStorage.getItem(REMEMBER_PHONE_KEY) ?? '';
  } catch {
    return '';
  }
};

/**
 * 登录 / 注册页
 * @returns 页面节点
 */
const Login = () => {
  const { user, loading, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [mode, setMode] = useState<FormMode>('login');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const from = readRedirectFrom(location.state);
  const notice = readNotice(location.state);

  // 首次进入时回填记住的手机号
  useEffect(() => {
    const remembered = readRememberedPhone();
    if (remembered !== '') {
      setPhone(remembered);
      setRemember(true);
    }
  }, []);

  // 已登录时直接回到原目标页，避免重复登录
  if (!loading && user !== null) {
    return <Navigate to={from} replace />;
  }

  /**
   * 切换表单模式并清空错误提示
   * @param next - 目标模式
   * @returns 无
   */
  const switchMode = (next: FormMode): void => {
    setMode(next);
    setError('');
    setConfirm('');
  };

  /**
   * 提交表单
   * @param event - 表单提交事件
   * @returns 无
   */
  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError('');

    // 表单校验就地显示，不用 Toast
    if (!PHONE_PATTERN.test(phone)) {
      setError('请输入正确的 11 位手机号');
      return;
    }

    if (mode === 'register') {
      if (!PASSWORD_PATTERN.test(password)) {
        setError('密码需包含数字与字母，且长度不少于 8 位');
        return;
      }
      if (password !== confirm) {
        setError('两次输入的密码不一致');
        return;
      }
    } else if (password === '') {
      setError('请输入密码');
      return;
    }

    setPending(true);
    try {
      if (mode === 'register') {
        await signUp(phone, password);
      } else {
        await signIn(phone, password);
      }

      // 按勾选状态写入 / 清除记住账号
      try {
        if (remember) {
          window.localStorage.setItem(REMEMBER_PHONE_KEY, phone);
        } else {
          window.localStorage.removeItem(REMEMBER_PHONE_KEY);
        }
      } catch {
        // 隐私模式下写入失败不影响登录流程
      }

      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败，请稍后重试');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={styles.page}>
      {/* 全屏风景背景：纯装饰，alt 置空即可 */}
      <img className={styles.background} src={loginBg} alt="" />

      {/* 右上角品牌口号 */}
      <span className={styles.slogan}>记录 · 思考 · 成长</span>

      {/* 左侧品牌视觉区 */}
      <section className={styles.hero}>
        <span className={styles.brand}>
          weekly
          <LeafIcon />
        </span>

        <h1 className={styles.heroTitle}>
          一周一记，
          <br />
          遇见更好的自己
        </h1>
        <p className={styles.heroText}>
          用最简单的方式，记录工作与生活，
          <br />
          让每一周都留下清晰的成长轨迹。
        </p>

        <ul className={styles.features}>
          {FEATURES.map((item) => (
            <li key={item.title} className={styles.feature}>
              <span className={styles.featureIcon} aria-hidden>
                {item.icon}
              </span>
              <span className={styles.featureTexts}>
                <span className={styles.featureTitle}>{item.title}</span>
                <span className={styles.featureDesc}>{item.desc}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* 右侧悬浮登录卡片 */}
      <div className={styles.panel}>
        <div className={styles.card}>
          <div className={styles.tabs}>
            <button
              type="button"
              className={mode === 'login' ? styles.tabActive : styles.tab}
              onClick={() => switchMode('login')}
            >
              登录
            </button>
            <button
              type="button"
              className={mode === 'register' ? styles.tabActive : styles.tab}
              onClick={() => switchMode('register')}
            >
              注册
            </button>
          </div>

          {notice !== '' ? <p className={styles.notice}>{notice}</p> : null}

          <form className={styles.form} onSubmit={(event) => void handleSubmit(event)}>
            <label className={styles.field}>
              <span className={styles.fieldIcon} aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <rect x="7" y="3" width="10" height="18" rx="2" />
                  <path d="M11 18h2" strokeLinecap="round" />
                </svg>
              </span>
              <input
                className={styles.input}
                type="tel"
                inputMode="numeric"
                autoComplete="username"
                placeholder="请输入手机号"
                value={phone}
                maxLength={11}
                onChange={(event) => setPhone(event.target.value.trim())}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.fieldIcon} aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <rect x="5" y="10" width="14" height="10" rx="2" />
                  <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                </svg>
              </span>
              <input
                className={styles.input}
                type={showPassword ? 'text' : 'password'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                placeholder="请输入密码"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                className={styles.eyeButton}
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? '隐藏密码' : '显示密码'}
                title={showPassword ? '隐藏密码' : '显示密码'}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
                  <circle cx="12" cy="12" r="2.6" />
                </svg>
              </button>
            </label>

            {mode === 'register' ? (
              <>
                <label className={styles.field}>
                  <span className={styles.fieldIcon} aria-hidden>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <rect x="5" y="10" width="14" height="10" rx="2" />
                      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                      <path d="m10 15 1.5 1.5L14.5 13" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <input
                    className={styles.input}
                    type="password"
                    autoComplete="new-password"
                    placeholder="请再次输入密码"
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                  />
                </label>
                <p className={styles.hint}>密码需包含数字与字母，长度不少于 8 位</p>
              </>
            ) : null}

            {mode === 'login' ? (
              <div className={styles.formRow}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    checked={remember}
                    onChange={(event) => setRemember(event.target.checked)}
                  />
                  记住账号
                </label>
                <span
                  className={styles.forgot}
                  title={`请联系 ${CONTACT_PHONE} 人工重置`}
                >
                  忘记密码？
                </span>
              </div>
            ) : null}

            {error !== '' ? <p className={styles.error}>{error}</p> : null}

            <button type="submit" className={styles.submit} disabled={pending}>
              {pending ? '处理中…' : mode === 'login' ? '登录' : '注册'}
            </button>
          </form>

          <div className={styles.divider}>
            <span>或</span>
          </div>

          <button
            type="button"
            className={styles.wechat}
            onClick={() => setError('微信登录暂未开放，请使用手机号登录')}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M9.3 4C5.8 4 3 6.4 3 9.4c0 1.7.9 3.2 2.3 4.2l-.6 1.9 2.1-1.1c.5.1 1 .2 1.6.2-.1-.4-.1-.8-.1-1.2 0-3 2.9-5.4 6.4-5.4h.4C14.5 5.6 12.1 4 9.3 4Zm-2 3.1a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8Zm4.2 0a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8Zm3.3 2.3c-3 0-5.4 2-5.4 4.4s2.4 4.4 5.4 4.4c.5 0 1-.1 1.4-.2l1.8 1-.5-1.7c1.2-.8 2-2.1 2-3.5 0-2.4-2.4-4.4-5.4-4.4H15Zm-1.7 2.3a.8.8 0 1 1 0 1.6.8.8 0 0 1 0-1.6Zm3.5 0a.8.8 0 1 1 0 1.6.8.8 0 0 1 0-1.6Z" />
            </svg>
            微信登录
          </button>

          <p className={styles.contact}>— weekly —</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
