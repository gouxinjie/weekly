/**
 * @component 登录 / 注册页
 * @description 全屏居中卡片，两页签切换；不属于登录后的两种骨架，底部常驻联系方式
 * @author gouxinjie
 * @created 2026-09-18
 * @updated 2026-09-18
 */
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { CONTACT_PHONE } from '@/constants';
import { useAuth } from '@/contexts/AuthContext';
import styles from './index.module.scss';

/** 两种表单模式 */
type FormMode = 'login' | 'register';

/** 手机号格式：中国大陆 11 位 */
const PHONE_PATTERN = /^1[3-9]\d{9}$/;

/** 密码强度：必须同时含数字与字母，长度不少于 8 位 */
const PASSWORD_PATTERN = /^(?=.*[0-9])(?=.*[a-zA-Z]).{8,}$/;

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
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const from = readRedirectFrom(location.state);
  const notice = readNotice(location.state);

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
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败，请稍后重试');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.brand}>weekly</h1>

        {notice !== '' ? <p className={styles.notice}>{notice}</p> : null}

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

        <form className={styles.form} onSubmit={(event) => void handleSubmit(event)}>
          <label className={styles.field}>
            <span className={styles.label}>手机号</span>
            <input
              className={styles.input}
              type="tel"
              inputMode="numeric"
              autoComplete="username"
              value={phone}
              maxLength={11}
              onChange={(event) => setPhone(event.target.value.trim())}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>密码</span>
            <input
              className={styles.input}
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          {mode === 'register' ? (
            <>
              <label className={styles.field}>
                <span className={styles.label}>确认密码</span>
                <input
                  className={styles.input}
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                />
              </label>
              <p className={styles.hint}>密码需包含数字与字母，长度不少于 8 位</p>
            </>
          ) : null}

          {error !== '' ? <p className={styles.error}>{error}</p> : null}

          <button type="submit" className={styles.submit} disabled={pending}>
            {pending ? '处理中…' : mode === 'login' ? '登录' : '注册'}
          </button>
        </form>

        <p className={styles.contact}>
          忘记密码？请联系 {CONTACT_PHONE}
        </p>
      </div>
    </div>
  );
};

export default Login;
