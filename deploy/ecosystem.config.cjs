/**
 * weekly 后端的 pm2 进程配置
 *
 * 用法（服务器上）：
 *   pm2 start /var/www/weekly/deploy/ecosystem.config.cjs
 *   pm2 save
 *
 * 说明：
 *   - 本文件由 CI 每次发布时同步到 /var/www/weekly/deploy/，
 *     请修改仓库中的副本，不要直接改服务器上的文件
 *   - 运行环境变量不在这里集中维护：config.ts 会自行读取 /var/www/weekly/.env；
 *     这里只显式声明 NODE_ENV，避免 .env 漏配时日志退化成 debug
 *   - SQLite 是单写者，instances 固定为 1，不要改成 cluster 多实例
 */
module.exports = {
  apps: [
    {
      /** pm2 进程名，release.sh 与日志命令都用这个名字 */
      name: 'weekly',

      /** 入口为 tsc 构建产物，dist/ 由 CI 发布覆盖 */
      script: 'dist/index.js',

      /** 工作目录固定为 server/，与 .env 中相对路径的解析基准保持一致 */
      cwd: '/var/www/weekly/server',

      /** SQLite 单写者：只能单实例，fork 模式即可 */
      instances: 1,
      exec_mode: 'fork',

      /** 生产标识：决定 Fastify 日志级别 */
      env: {
        NODE_ENV: 'production',
      },

      /** 崩溃自动拉起；连续重启过多则停止，避免坏配置把机器拖垮 */
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,

      /** 日志行带时间戳，便于对照发布时刻排查启动失败 */
      time: true,
    },
  ],
};
