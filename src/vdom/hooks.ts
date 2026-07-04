/**
 * vdom/hooks.ts — Fiber system + hooks for function components
 *
 * Each function component invocation is tracked by a "fiber" that owns:
 * - a hooks array (indexed by call order, like React)
 * - a rendered VNode tree (for diffing against the next render)
 * - a reference back to the VNode (for DOM access)
 *
 * Hooks provided: useState, useEffect, useMemo, useCallback
 */

import type { ComponentInstance, ComponentType, VNode } from "./types";
import { scheduleRender } from "./scheduler";

// ── Fiber ────────────────────────────────────────────────────────────

export interface Fiber {
  vnode: VNode;
  hooks: HookEntry[];
  rendered: VNode | null;
  rendering: boolean;
  instance?: ComponentInstance;  // set for class components
}

type HookEntry =
  | { type: "state"; value: unknown; setter: ((v: unknown) => void) | null }
  | { type: "effect"; deps: unknown[] | undefined; cleanup: (() => void) | null }
  | { type: "memo"; value: unknown; deps: unknown[] | undefined }
  | { type: "callback"; value: (...a: any[]) => any; deps: unknown[] | undefined };

// ── Global render context ────────────────────────────────────────────

let currentFiber: Fiber | null = null;
let hookIndex = 0;
let pendingEffects: (() => void)[] = [];

/** Get or create a fiber attached to a VNode. */
export function getFiber(vnode: VNode): Fiber {
  let f = (vnode as any)._fiber as Fiber | undefined;
  if (!f) {
    f = { vnode, hooks: [], rendered: null, rendering: false };
    (vnode as any)._fiber = f;
  }
  return f;
}

/** Run a function component inside a fiber context (sets up hook indexing). */
export function renderWithHooks<T>(fiber: Fiber, fn: () => T): T {
  const prev = currentFiber;
  currentFiber = fiber;
  hookIndex = 0;
  fiber.rendering = true;
  try {
    return fn();
  } finally {
    fiber.rendering = false;
    currentFiber = prev;
  }
}

function assertHookContext(name: string) {
  if (!currentFiber?.rendering) throw new Error(`hhui: ${name}() outside render`);
}

function nextHook(name: string): HookEntry {
  assertHookContext(name);
  const idx = hookIndex++;
  if (idx >= currentFiber!.hooks.length) {
    currentFiber!.hooks.push({ type: "state", value: undefined, setter: null });
  }
  return currentFiber!.hooks[idx];
}

// ── useState ─────────────────────────────────────────────────────────

export function useState<T>(initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const entry = nextHook("useState") as Extract<HookEntry, { type: "state" }>;
  const fiber = currentFiber!;

  if (entry.value === undefined && initial !== undefined) entry.value = initial;

  if (!entry.setter) {
    entry.setter = (v: unknown) => {
      const nextVal = typeof v === "function" ? (v as (p: T) => T)(entry.value as T) : v;
      if (nextVal !== entry.value) {
        entry.value = nextVal;
        scheduleFiberRender(fiber);
      }
    };
  }
  return [entry.value as T, entry.setter as (v: T | ((p: T) => T)) => void];
}

// ── useEffect ────────────────────────────────────────────────────────

export function useEffect(cb: () => void | (() => void), deps?: unknown[]) {
  const entry = nextHook("useEffect") as Extract<HookEntry, { type: "effect" }>;
  const shouldRun = !entry.deps || !deps || deps.length !== entry.deps.length
    || deps.some((d, i) => !Object.is(d, entry.deps![i]));

  if (shouldRun) {
    entry.deps = deps;
    pendingEffects.push(() => {
      if (entry.cleanup) { try { entry.cleanup(); } catch {} entry.cleanup = null; }
      const ret = cb();
      if (typeof ret === "function") entry.cleanup = ret;
    });
  }
}

// ── useMemo / useCallback ────────────────────────────────────────────

export function useMemo<T>(factory: () => T, deps: unknown[]): T {
  const entry = nextHook("useMemo") as Extract<HookEntry, { type: "memo" }>;
  const recompute = entry.value === undefined || !entry.deps
    || deps.length !== entry.deps.length || deps.some((d, i) => !Object.is(d, entry.deps![i]));
  if (recompute) { entry.deps = deps; entry.value = factory(); }
  return entry.value as T;
}

export function useCallback<T extends (...a: any[]) => any>(fn: T, deps: unknown[]): T {
  const entry = nextHook("useCallback") as Extract<HookEntry, { type: "callback" }>;
  const update = entry.value === undefined || !entry.deps
    || deps.length !== entry.deps.length || deps.some((d, i) => !Object.is(d, entry.deps![i]));
  if (update) { entry.deps = deps; entry.value = fn; }
  return entry.value as T;
}

// ── Effect flushing ──────────────────────────────────────────────────

export function flushEffects() {
  const fx = pendingEffects.splice(0);
  for (const f of fx) { try { f(); } catch {} }
}

// ── Fiber re-render (setState → schedule → re-execute + patch) ───────

/** Called by useState setter and Component.setState. */
export function scheduleFiberRender(fiber: Fiber) {
  scheduleRender(() => {
    if (!fiber.vnode?.el) return;  // unmounted

    let newRendered: VNode | null = null;
    if (fiber.instance) {
      newRendered = fiber.instance.render();
    } else {
      const comp = fiber.vnode.tag as (props: any) => VNode | null;
      renderWithHooks(fiber, () => { newRendered = comp(buildProps(fiber.vnode)); });
    }

    if (fiber.rendered && newRendered) {
      patchVNode(fiber.rendered, newRendered);
      fiber.rendered = newRendered;
    }
  });
}

// We import patchVNode lazily to avoid circular deps.
let patchVNode: (old: VNode, nw: VNode) => void = () => {};
export function setPatcher(fn: typeof patchVNode) { patchVNode = fn; }

/** Build the effective props for a function component (adds children). */
export function buildProps(vnode: VNode): Record<string, any> {
  return vnode.children.length > 0
    ? { ...vnode.props, children: vnode.children }
    : vnode.props;
}
