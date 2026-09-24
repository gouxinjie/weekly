/**
 * 类名工具
 * 说明：条件类名很常见，直接拼模板字符串会留下多余空格；
 * 若把布尔值或 undefined 也塞进去，还会写出 class="false" / "undefined" 这种脏类名。
 */

/**
 * 拼接类名
 * @param names - 类名，或应当忽略的假值（false / undefined / 空串）
 * @returns 以单个空格连接的类名字符串；全部为空时返回空串
 * @remarks 需要参与条件判断时必须传 `cond ? styles.x : undefined`，
 * 不要传 `cond && styles.x`——后者在 cond 为假时会留下布尔值。
 */
export const cx = (...names: (string | false | undefined)[]): string =>
  names.filter((name): name is string => typeof name === 'string' && name !== '').join(' ');
