/// <reference types="vite/client" />

/**
 * 构建时注入的全局常量
 * 说明：由 vite.config.ts 的 define 注入数字字面量，避免把全部环境变量暴露到浏览器。
 */
declare const __START_YEAR__: number;
declare const __MAX_WEEK__: number;

/**
 * 视图过渡（View Transitions API）
 * 说明：TS 自带 DOM 类型里还没有它，这里补最小声明。
 * startViewTransition 在不支持的浏览器上是 undefined，运行时按能力检测，不做特性嗅探。
 */
interface ViewTransition {
  /** 过渡动画结束后兑现；过渡被跳过时同样会兑现 */
  readonly finished: Promise<void>;
}

interface Document {
  /** 开启一次视图过渡：回调内 DOM 更新完成后，浏览器用新旧快照做交叉淡化；
      回调允许异步，将来可以在里面等数据就绪后再完成 DOM 更新 */
  startViewTransition?: (callback: () => void | Promise<void>) => ViewTransition;
}
