/**
 * vdom/types.ts — Core type definitions
 */

import type { Fragment } from "./h";

/** A primitive child in the VNode tree. */
export type Child = VNode | string | number | null | undefined | false;

/** A props bag. Children are injected at call time by mount/patch. */
export type Props = Record<string, any>;

/** Any renderable component (function, class, or fragment). */
export type ComponentType<P = any> = ((props: P) => VNode | null) | (abstract new (props: P) => ComponentInstance);

/** A virtual DOM node. */
export interface VNode {
  tag: string | ComponentType | typeof Fragment;
  props: Props;
  children: Child[];
  /** Cached real DOM node (set during first mount, reused by patch). */
  el?: Node;
}

/** Contract fulfilled by the Component base class. */
export interface ComponentInstance {
  render(): VNode | null;
}
