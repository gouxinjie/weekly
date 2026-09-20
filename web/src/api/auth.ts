import { request } from './client';
import type { ChangePasswordBody, CredentialsBody, UserResponse } from '@/types/api';

/**
 * 注册
 * @param body - 手机号与密码
 * @returns 新用户信息（注册成功即建立登录态）
 */
export const register = (body: CredentialsBody): Promise<UserResponse> =>
  request.post<UserResponse>('/api/auth/register', body);

/**
 * 登录
 * @param body - 手机号与密码
 * @returns 当前用户信息
 */
export const login = (body: CredentialsBody): Promise<UserResponse> =>
  request.post<UserResponse>('/api/auth/login', body);

/**
 * 获取当前登录用户
 * @returns 当前用户信息
 * @remarks 未登录时抛出 401，调用方据此判定登录态
 */
export const fetchCurrentUser = (): Promise<UserResponse> =>
  request.get<UserResponse>('/api/auth/me');

/**
 * 登出当前设备
 * @returns 无
 */
export const logout = (): Promise<null> => request.post<null>('/api/auth/logout');

/**
 * 登出所有设备
 * @returns 无
 */
export const logoutAll = (): Promise<null> => request.post<null>('/api/auth/logout-all');

/**
 * 修改密码
 * @param body - 原密码与新密码
 * @returns 无
 */
export const changePassword = (body: ChangePasswordBody): Promise<null> =>
  request.post<null>('/api/auth/password', body);
