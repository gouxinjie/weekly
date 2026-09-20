/// <reference types="vite/client" />

/**
 * 构建时注入的全局常量
 * 说明：由 vite.config.ts 的 define 注入数字字面量，避免把全部环境变量暴露到浏览器。
 */
declare const __START_YEAR__: number;
declare const __MAX_WEEK__: number;
