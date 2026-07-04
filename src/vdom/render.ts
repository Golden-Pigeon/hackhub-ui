/**
 * vdom/render.ts — Public render API
 *
 * render(vnode, container) clears the container and mounts the VNode tree.
 * call by the app's bootstrap entry (app.ts).
 */

import type { VNode } from "./types";
import { mountVNode } from "./mount";
import { flushEffects } from "./hooks";

export function render(vnode: VNode, container: HTMLElement) {
  container.textContent = "";
  const el = mountVNode(vnode);
  if (el) container.appendChild(el);
  flushEffects();
}
