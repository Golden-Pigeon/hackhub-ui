/**
 * vdom/h.ts — JSX factory
 *
 * h("div", { class: "x" }, child1, child2) creates a VNode.
 * With tsconfig jsxFactory=h, <div class="x">{v}</div> compiles to
 * h("div", { class: "x" }, v).
 */

import type { Child, ComponentType, VNode } from "./types";

/** Fragment sentinel — renders children without a wrapper element. */
export const Fragment = Symbol("h.Fragment");

/**
 * Create a virtual node.
 *
 * @param tag  Element name (string), a function/class component, or Fragment.
 * @param props  Attributes; the key `children` (if present) is grafted in.
 * @param children  Additional children appended after props.children.
 */
export function h(
  tag: string | ComponentType | typeof Fragment,
  props?: Record<string, any> | null,
  ...children: Child[]
): VNode {
  // Flatten nested arrays (needed for .map() results).
  const flat: Child[] = [];
  for (const c of children) {
    if (Array.isArray(c)) flat.push(...(c as Child[]));
    else flat.push(c);
  }

  return { tag, props: props ?? {}, children: flat };
}
