/**
 * @component 登录态上下文
 * @description 用 useState + Context 管理当前用户与登录 / 注册 / 登出动作，不引入任何状态管理库
 * @author gouxinjie
 * @created 2026-09-18
 * @updated 2026-09-18
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { changePassword, fetchCurrentUser, login, logout, logoutAll, register } from '@/api/auth';
import { toErrorMessage } from '@/api/client';
import type { ChangePasswordBody } from '@/types/api';
import type { User } from '@/types/models';

/** 上下文暴露的能力 */
interface AuthContextValue {
  /** 当前登录用户，未登录为 null */
  user: User | null;
  /** 是否正在校验登录态（首屏渲染期间为 true） */
  loading: boolean;
  /** 登录 */
  signIn: (phone: string, password: string) => Promise<void>;
  /** 注册（成功后自动登录） */
  signUp: (phone: string, password: string) => Promise<void>;
  /** 登出当前设备 */
  signOut: () => Promise<void>;
  /** 登出所有设备 */
  signOutAll: () => Promise<void>;
  /** 修改密码 */
  updatePassword: (body: ChangePasswordBody) => Promise<void>;
}

/** 登录态上下文 */
const AuthContext = createContext<AuthContextValue | null>(null);

/** AuthProvider 属性 */
interface AuthProviderProps {
  /** 子节点 */
  children: ReactNode;
}

/**
 * 登录态 Provider
 * @param props - 仅包含 children
 * @returns 包裹了上下文的节点
 */
export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // 首屏用 /me 校验会话：401 表示未登录，其他异常同样按未登录处理，不阻塞页面
  useEffect(() => {
    let active = true;

    const load = async (): Promise<void> => {
      try {
        const current = await fetchCurrentUser();
        if (active) setUser(current);
      } catch {
        // 未登录（401）或网络异常统一按未登录处理，避免首屏卡在 loading
        if (active) setUser(null);
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, []);

  /**
   * 登录
   * @param phone - 手机号
   * @param password - 明文密码
   * @throws Error 失败时抛出带中文提示的异常，由调用方就地展示
   */
  const signIn = useCallback(async (phone: string, password: string): Promise<void> => {
    try {
      const current = await login({ phone, password });
      setUser(current);
    } catch (error) {
      throw new Error(toErrorMessage(error, '登录失败，请稍后重试'));
    }
  }, []);

  /**
   * 注册
   * @param phone - 手机号
   * @param password - 明文密码
   * @throws Error 失败时抛出带中文提示的异常
   */
  const signUp = useCallback(async (phone: string, password: string): Promise<void> => {
    try {
      const current = await register({ phone, password });
      setUser(current);
    } catch (error) {
      throw new Error(toErrorMessage(error, '注册失败，请稍后重试'));
    }
  }, []);

  /** 登出当前设备 */
  const signOut = useCallback(async (): Promise<void> => {
    try {
      await logout();
    } finally {
      setUser(null);
    }
  }, []);

  /** 登出所有设备 */
  const signOutAll = useCallback(async (): Promise<void> => {
    try {
      await logoutAll();
    } finally {
      setUser(null);
    }
  }, []);

  /**
   * 修改密码
   * @param body - 原密码与新密码
   * @throws Error 失败时抛出带中文提示的异常
   */
  const updatePassword = useCallback(async (body: ChangePasswordBody): Promise<void> => {
    try {
      await changePassword(body);
    } catch (error) {
      throw new Error(toErrorMessage(error, '修改密码失败，请稍后重试'));
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, signIn, signUp, signOut, signOutAll, updatePassword }),
    [user, loading, signIn, signUp, signOut, signOutAll, updatePassword],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

/**
 * 读取登录态上下文
 * @returns 登录态上下文
 * @throws Error 在 AuthProvider 之外调用时抛出
 */
export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuth 必须在 AuthProvider 内部使用');
  }
  return context;
};
