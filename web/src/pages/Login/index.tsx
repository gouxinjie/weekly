/**
 * @component 登录 / 注册页
 * @description 全屏风景背景 + 右上角品牌口号 + 右侧悬浮白色登录卡片；
 * 登录 / 注册两页签切换，支持记住账号
 * @author gouxinjie
 * @created 2026-09-18
 * @updated 2026-09-23
 */
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import loginBg from '@/assets/login-bg.webp';
import { CONTACT_PHONE, REMEMBER_PHONE_KEY } from '@/constants';
import { useAuth } from '@/contexts/AuthContext';
import { navigateWithTransition } from '@/utils/routeTransition';
import styles from './index.module.scss';

/** 两种表单模式 */
type FormMode = 'login' | 'register';

/** 手机号格式：中国大陆 11 位 */
const PHONE_PATTERN = /^1[3-9]\d{9}$/;

/** 密码强度：必须同时含数字与字母，长度不少于 6 位 */
const PASSWORD_PATTERN = /^(?=.*[0-9])(?=.*[a-zA-Z]).{6,}$/;

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
        setError('密码需包含数字与字母，且长度不少于 6 位');
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

      navigateWithTransition(navigate, from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败，请稍后重试');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={styles.page}>
      {/* 页面语义标题：视觉上不呈现（见 .srOnly 注释），仅提供给读屏与搜索引擎 */}
      <h1 className={styles.srOnly}>weekly 登录</h1>

      {/* 全屏风景背景：纯装饰，alt 置空即可；首屏首元素，明确高优先级下载 */}
      <img className={styles.background} src={loginBg} alt="" fetchPriority="high" />

      {/* 右上角品牌口号 */}
      <span className={styles.slogan}>记录 · 思考 · 成长</span>

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
                <p className={styles.hint}>密码需包含数字与字母，长度不少于 6 位</p>
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
