import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

/** 当前配置文件所在目录（web/），用 import.meta.dirname 而非 __dirname 以适配原生配置加载器 */
const WEB_DIR = import.meta.dirname;

/**
 * Vite 配置
 * 说明：开发态把 /api 代理到 Fastify，前后端同源，因此不需要也不允许引入 CORS 中间件。
 * 环境变量与后端共用仓库根目录的 .env，只把时间轴相关的两个数字注入前端产物。
 */
export default defineConfig(({ mode }) => {
  const envDir = path.resolve(WEB_DIR, '..');
  const env = loadEnv(mode, envDir, '');

  const startYear = Number(env.START_YEAR ?? 2026);
  const maxWeek = Number(env.MAX_WEEK ?? 53);

  // 代理目标与后端共用同一份 .env：改后端端口时不必再手工同步这里，
  // 否则很容易出现「后端换了端口、代理还指向旧端口」，表现为接口返回异常格式的响应
  const apiPort = Number(env.PORT ?? 3000);
  const apiHost = env.HOST === undefined || env.HOST === '0.0.0.0' ? '127.0.0.1' : env.HOST;
  const apiTarget = `http://${apiHost}:${apiPort}`;

  return {
    envDir,

    plugins: [react()],

    define: {
      // 只注入数字字面量，避免把整张环境变量表暴露到浏览器
      __START_YEAR__: JSON.stringify(Number.isFinite(startYear) ? startYear : 2026),
      __MAX_WEEK__: JSON.stringify(Number.isFinite(maxWeek) ? maxWeek : 53),
    },

    resolve: {
      alias: {
        // 必须与 tsconfig.json 的 paths 保持一致
        '@': path.resolve(WEB_DIR, './src'),
      },
    },

    css: {
      modules: {
        // class 名保留可读语义，便于排查样式问题
        generateScopedName: '[name]__[local]__[hash:base64:5]',
      },
    },

    server: {
      // 显式绑定 IPv4：默认的 localhost 在 Windows 上会解析成 ::1，导致 127.0.0.1 访问不通
      host: '127.0.0.1',
      port: 5173,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },

    build: {
      outDir: 'dist',
      sourcemap: false,
    },
  };
});
