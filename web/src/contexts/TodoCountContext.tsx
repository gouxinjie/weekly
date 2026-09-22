/**
 * @component 待办计数上下文
 * @description 为「待办」页签角标（M-09）提供未完成条数，并允许待办页在增删改后主动刷新
 * @author gouxinjie
 * @created 2026-09-22
 * @updated 2026-09-22
 * @remarks 角标挂在页签栏上，周报页与设置页同样可见，因此不能只在待办页内部派生，
 *          必须由这一处统一拉取——否则切到周报页时角标会丢失。
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { fetchTodoSummary } from '@/api/todo';
import { useAuth } from '@/contexts/AuthContext';

/** 上下文暴露的能力 */
interface TodoCountContextValue {
  /** 未完成的待办条数，未登录或尚未取到时为 0 */
  undoneCount: number;
  /** 重新拉取未完成条数，待办页在增删改后调用 */
  refreshUndoneCount: () => void;
}

/** 待办计数上下文 */
const TodoCountContext = createContext<TodoCountContextValue | null>(null);

/** TodoCountProvider 属性 */
interface TodoCountProviderProps {
  /** 子节点 */
  children: ReactNode;
}

/**
 * 待办计数 Provider
 * @param props - 仅包含 children
 * @returns 包裹了上下文的节点
 */
export const TodoCountProvider = ({ children }: TodoCountProviderProps) => {
  const { user } = useAuth();
  const [undoneCount, setUndoneCount] = useState(0);

  /**
   * 拉取未完成条数
   * @returns 无
   */
  const refreshUndoneCount = useCallback((): void => {
    // 未登录时不发请求：登录页也会落在 Provider 内，避免无谓的 401
    if (user === null) {
      setUndoneCount(0);
      return;
    }

    void fetchTodoSummary()
      .then((summary) => setUndoneCount(summary.undone))
      .catch(() => {
        // 角标属于辅助信息，失败时保留原值，不打断主流程
      });
  }, [user]);

  // 登录态变化时刷新一次：登录后拉取，登出后清零
  useEffect(() => {
    refreshUndoneCount();
  }, [refreshUndoneCount]);

  const value = useMemo<TodoCountContextValue>(
    () => ({ undoneCount, refreshUndoneCount }),
    [undoneCount, refreshUndoneCount],
  );

  return <TodoCountContext.Provider value={value}>{children}</TodoCountContext.Provider>;
};

/**
 * 读取待办计数上下文
 * @returns 待办计数上下文
 * @throws Error 在 TodoCountProvider 之外调用时抛出
 */
export const useTodoCount = (): TodoCountContextValue => {
  const context = useContext(TodoCountContext);
  if (context === null) {
    throw new Error('useTodoCount 必须在 TodoCountProvider 内部使用');
  }
  return context;
};
