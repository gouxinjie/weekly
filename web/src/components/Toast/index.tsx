/**
 * @component 顶部提示
 * @description 仅用于跨区域的短反馈（如导出成功、已登出所有设备），表单校验与保存失败一律就地显示
 * @author gouxinjie
 * @created 2026-09-18
 * @updated 2026-09-18
 */
import { useEffect } from 'react';
import styles from './index.module.scss';

/** Toast 属性 */
interface ToastProps {
  /** 提示文案，为空字符串时不渲染 */
  message: string;
  /** 自动消失时长（毫秒），默认 3000 */
  duration?: number;
  /** 关闭回调 */
  onDismiss: () => void;
}

/**
 * 顶部提示
 * @param props - 见 ToastProps
 * @returns 提示节点或 null
 */
const Toast = ({ message, duration = 3000, onDismiss }: ToastProps) => {
  useEffect(() => {
    if (message === '') return undefined;

    const timer = window.setTimeout(onDismiss, duration);
    return () => {
      window.clearTimeout(timer);
    };
  }, [message, duration, onDismiss]);

  if (message === '') return null;

  return (
    <div className={styles.toast} role="status">
      {message}
    </div>
  );
};

export default Toast;
