/**
 * vdom/mount.ts — DOM creation + patch/diff
 *
 * mountVNode: first render (create real DOM from VNode)
 * patchVNode: incremental update (diff old vs new, apply to DOM)
 *
 * Both handle: host elements, function components, class components,
 * fragments, text nodes, and null/falsy children.
 */

import type { Child, ComponentType, ComponentInstance, VNode } from "./types";
import { Fragment } from "./h";
import {
  getFiber, renderWithHooks, flushEffects, setPatcher,
  scheduleFiberRender, buildProps, type Fiber,
} from "./hooks";
import { Component } from "./component";

const SVG_NS = "http://www.w3.org/2000/svg";
const SVG_TAGS = new Set([
  "svg", "path", "circle", "rect", "line", "polyline", "polygon",
  "g", "defs", "use", "text", "tspan", "ellipse", "image",
]);

// Register our patch function for setState re-renders.
setPatcher(patchVNode);

// ── mount (first render) ─────────────────────────────────────────────

export function mountVNode(child: Child): Node | null {
  if (child === null || child === undefined || child === false || child === true) return null;
  if (typeof child === "string" || typeof child === "number") return document.createTextNode(String(child));

  const vnode = child as VNode;

  // Fragment
  if (vnode.tag === Fragment) {
    const frag = document.createDocumentFragment();
    for (const c of vnode.children) { const n = mountVNode(c); if (n) frag.appendChild(n); }
    return frag;
  }

  // Function or class component
  if (typeof vnode.tag === "function") return mountComponent(vnode);

  // Host element
  const el = createElement(vnode);
  vnode.el = el;
  for (const c of vnode.children) { const n = mountVNode(c); if (n) el.appendChild(n); }
  return el;
}

function createElement(vnode: VNode): Element {
  const tag = vnode.tag as string;
  const isSVG = SVG_TAGS.has(tag);
  const el = isSVG ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  applyProps(el, {}, vnode.props, isSVG);
  return el;
}

function mountComponent(vnode: VNode): Node | null {
  const fiber = getFiber(vnode);
  const comp = vnode.tag as ComponentType;

  if (isClassComponent(comp)) {
    return mountClassComponent(fiber, vnode, comp as abstract new (p: any) => ComponentInstance);
  }
  return mountFunctionComponent(fiber, vnode, comp as (p: any) => VNode | null);
}

function isClassComponent(tag: ComponentType): boolean {
  return typeof tag === "function" && "prototype" in tag && "render" in tag.prototype;
}

function mountFunctionComponent(
  fiber: Fiber, vnode: VNode, comp: (p: any) => VNode | null
): Node | null {
  let rendered: VNode | null = null;
  renderWithHooks(fiber, () => { rendered = comp(buildProps(vnode)); });
  fiber.rendered = rendered;
  const el = mountVNode(rendered);
  vnode.el = el ?? undefined;
  return el;
}

function mountClassComponent(
  fiber: Fiber, vnode: VNode, Ctor: abstract new (p: any) => ComponentInstance
): Node | null {
  const inst = new Ctor(buildProps(vnode));
  (inst as any)._fiber = fiber;
  fiber.instance = inst;
  const rendered = inst.render();
  fiber.rendered = rendered;
  const el = mountVNode(rendered);
  vnode.el = el ?? undefined;
  if (typeof (inst as any).componentDidMount === "function") {
    queueMicrotask(() => (inst as any).componentDidMount());
  }
  return el;
}

// ── patch (diff + update) ────────────────────────────────────────────

export function patchVNode(oldVN: VNode, newVN: VNode) {
  if (oldVN.tag !== newVN.tag) {
    replaceNode(oldVN, newVN);
    return;
  }

  // Same component type
  if (typeof newVN.tag === "function") {
    patchComponent(oldVN, newVN);
    return;
  }

  // Same host tag — reuse DOM, diff props + children.
  newVN.el = oldVN.el;
  const el = newVN.el;
  if (!el) return;
  const isSVG = SVG_TAGS.has(newVN.tag as string);
  applyProps(el, oldVN.props, newVN.props, isSVG);
  patchChildren(el as HTMLElement, oldVN.children, newVN.children);
}

function replaceNode(oldVN: VNode, newVN: VNode) {
  const parent = oldVN.el?.parentNode;
  if (parent) {
    const newEl = mountVNode(newVN);
    if (oldVN.el) {
      if (newEl) parent.replaceChild(newEl, oldVN.el);
      else parent.removeChild(oldVN.el);
    }
  }
}

function patchComponent(oldVN: VNode, newVN: VNode) {
  // Carry over fiber from old → new VNode.
  const fiber = getFiber(newVN);
  const oldFiber = (oldVN as any)._fiber as Fiber | undefined;
  if (oldFiber && !(newVN as any)._fiber) {
    (newVN as any)._fiber = oldFiber;
    Object.assign(fiber, { vnode: newVN });
  }

  let newRendered: VNode | null = null;

  if (fiber.instance) {
    // Class component — update props, re-render.
    (fiber.instance as any)._updateProps(buildProps(newVN));
    if (typeof (fiber.instance as any).componentDidUpdate === "function") {
      queueMicrotask(() => (fiber.instance as any).componentDidUpdate());
    }
    newRendered = fiber.instance.render();
  } else {
    // Function component — re-execute.
    const comp = newVN.tag as (p: any) => VNode | null;
    renderWithHooks(fiber, () => { newRendered = comp(buildProps(newVN)); });
  }

  if (fiber.rendered && newRendered) {
    patchVNode(fiber.rendered, newRendered);
    fiber.rendered = newRendered;
    newVN.el = newRendered.el;
  }
}

// ── children diff ────────────────────────────────────────────────────

function patchChildren(parent: HTMLElement, oldCh: Child[], newCh: Child[]) {
  const max = Math.max(oldCh.length, newCh.length);
  for (let i = 0; i < max; i++) {
    const oldC = oldCh[i];
    const newC = newCh[i];

    if (oldC === undefined && newC !== undefined) {
      const n = mountVNode(newC); if (n) parent.appendChild(n);
    } else if (oldC !== undefined && newC === undefined) {
      if (parent.childNodes[i]) parent.removeChild(parent.childNodes[i]);
    } else if (oldC !== newC) {
      patchChild(parent, oldC!, newC!, i);
    }
  }
}

function patchChild(parent: HTMLElement, oldC: Child, newC: Child, index: number) {
  // null ↔ value transitions
  if (!oldC && !newC) return;
  if (!oldC && newC) { const n = mountVNode(newC); if (n) parent.appendChild(n); return; }
  if (oldC && !newC) { const c = parent.childNodes[index]; if (c) parent.removeChild(c); return; }

  const isOldPrim = typeof oldC === "string" || typeof oldC === "number";
  const isNewPrim = typeof newC === "string" || typeof newC === "number";

  if (isOldPrim && isNewPrim) {
    const el = parent.childNodes[index];
    if (el?.nodeType === Node.TEXT_NODE && el.textContent !== String(newC)) el.textContent = String(newC);
  } else if (isOldPrim !== isNewPrim) {
    const oldEl = parent.childNodes[index];
    const newEl = mountVNode(newC);
    if (oldEl && newEl) parent.replaceChild(newEl, oldEl);
    else if (oldEl) parent.removeChild(oldEl);
    else if (newEl) parent.appendChild(newEl);
  } else if (oldC && newC) {
    patchVNode(oldC as VNode, newC as VNode);
  }
}

// ── prop diffing ─────────────────────────────────────────────────────

export function applyProps(
  el: Element, oldP: Record<string, any>, newP: Record<string, any>, isSVG: boolean
) {
  // Remove stale props.
  for (const k in oldP) {
    if (k in newP) continue;
    removeProp(el, k, oldP[k] as any, isSVG);
  }
  // Set new / changed props.
  for (const k in newP) {
    if (oldP[k] === newP[k]) continue;
    setProp(el, k, oldP[k] as any, newP[k] as any, isSVG);
  }
}

function removeProp(el: Element, key: string, val: any, isSVG: boolean) {
  if (key.startsWith("on") && typeof val === "function") {
    el.removeEventListener(key.slice(2).toLowerCase(), val as EventListener);
  } else if (key === "className") {
    el.removeAttribute("class");
  } else if (key === "style") {
    (el as HTMLElement).style.cssText = "";
  } else {
    el.removeAttribute(key);
  }
}

function setProp(el: Element, key: string, _old: any, val: any, _isSVG: boolean) {
  if (key.startsWith("on") && typeof val === "function") {
    if (typeof _old === "function") el.removeEventListener(key.slice(2).toLowerCase(), _old as EventListener);
    el.addEventListener(key.slice(2).toLowerCase(), val as EventListener);
  } else if (key === "className") {
    el.setAttribute("class", String(val));
  } else if (key === "style" && typeof val === "object") {
    (el as HTMLElement).style.cssText = styleString(val);
  } else if (key === "value" || key === "checked") {
    (el as any)[key] = val;
  } else if (val === false || val === null || val === undefined) {
    el.removeAttribute(key);
  } else if (val === true) {
    el.setAttribute(key, "");
  } else {
    el.setAttribute(key, String(val));
  }
}

function styleString(style: Record<string, string>): string {
  let s = "";
  for (const k in style) s += `${k.replace(/[A-Z]/g, m => "-" + m.toLowerCase())}: ${style[k]}; `;
  return s.trim();
}
