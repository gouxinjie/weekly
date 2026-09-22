/**
 * @component 应用根组件
 * @description 定义 4 条路由与登录态守卫；登录页为独立布局，其余页面共用应用骨架
 * @author gouxinjie
 * @created 2026-09-18
 * @updated 2026-09-22
 */
import type { ReactElement } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import Login from '@/pages/Login';
import Settings from '@/pages/Settings';
import Todo from '@/pages/Todo';
import Weekly from '@/pages/Weekly';
import { getCurrentWeek } from '@/utils/week';
import styles from './App.module.scss';

/** 受保护路由属性 */
interface RequireAuthProps {
  /** 需要登录才能访问的页面 */
  children: ReactElement;
}

/**
 * 登录态守卫
 * @param props - 受保护的子节点
 * @returns 已登录时返回子节点，否则重定向到登录页并带上原路径
 */
const RequireAuth = ({ children }: RequireAuthProps) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className={styles.loading}>加载中…</div>;
  }

  if (user === null) {
    const from = `${location.pathname}${location.search}`;
    return <Navigate to="/login" replace state={{ from }} />;
  }

  return children;
};

/**
 * 备忘旧链接兼容跳转
 * @description 备忘模块更名为待办后，把历史 /memo 链接（连同 ?year=&week= 等查询参数）重定向到 /todo
 * @returns 重定向节点
 */
const RedirectMemoToTodo = () => {
  const location = useLocation();
  return <Navigate to={`/todo${location.search}`} replace />;
};

/**
 * 跳转到当前 ISO 周
 * @returns 重定向节点
 */
const RedirectToCurrentWeek = () => {
  const current = getCurrentWeek();
  return <Navigate to={`/weekly/${current.year}/${current.week}`} replace />;
};

/** 应用根组件 */
const App = () => (
  <BrowserRouter>
    <AuthProvider>
      <Routes>
        <Route path="/" element={<RedirectToCurrentWeek />} />

        {/* /weekly 不带参数时补全为当前 ISO 年的当前周 */}
        <Route path="/weekly" element={<RedirectToCurrentWeek />} />
        <Route
          path="/weekly/:year/:week"
          element={
            <RequireAuth>
              <Weekly />
            </RequireAuth>
          }
        />

        {/* 旧链接兼容：备忘模块更名为待办，历史 /memo 链接一律重定向到 /todo */}
        <Route path="/memo" element={<RedirectMemoToTodo />} />

        <Route
          path="/todo"
          element={
            <RequireAuth>
              <Todo />
            </RequireAuth>
          }
        />

        <Route
          path="/settings"
          element={
            <RequireAuth>
              <Settings />
            </RequireAuth>
          }
        />

        <Route path="/login" element={<Login />} />
        <Route path="*" element={<RedirectToCurrentWeek />} />
      </Routes>
    </AuthProvider>
  </BrowserRouter>
);

export default App;
