/**
 * vdom/scheduler.ts — Batching render requests
 *
 * Multiple setState / setState calls within the same synchronous tick
 * are batched into a single re-render via queueMicrotask.
 */

const pending = new Set<() => void>();
let scheduled = false;

/** Request a re-render. Deduplicates and batches. */
export function scheduleRender(render: () => void) {
  pending.add(render);
  if (!scheduled) {
    scheduled = true;
    queueMicrotask(flush);
  }
}

function flush() {
  scheduled = false;
  const renders = Array.from(pending);
  pending.clear();
  for (const r of renders) {
    try { r(); } catch { /* isolate failures */ }
  }
}

/** Run pending renders NOW (used by tests / synchronous needs). */
export function flushNow() {
  flush();
}
