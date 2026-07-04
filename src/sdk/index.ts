/** Type-safe HackHub SDK wrapper. */

// ── Types ─────────────────────────────────────────────────────────────

export interface FileInfo {
  id: string; name: string; extension?: string;
  isFolder?: boolean; data?: string; parent?: string;
  readonly?: boolean; hidden?: boolean;
}

interface FileCreateOptions {
  name: string; extension?: string; data?: string;
  parentPath?: string; isFolder?: boolean;
}

// ── Bridge access ────────────────────────────────────────────────────

declare const window: any;

function filesApi() {
  if (!window?.HackhubSDK?.Files) throw new Error("HackhubSDK.Files unavailable");
  return window.HackhubSDK.Files;
}
function eventsApi() {
  if (!window?.HackhubSDK?.Events) throw new Error("HackhubSDK.Events unavailable");
  return window.HackhubSDK.Events;
}
function uiApi() { return window?.HackhubSDK?.UI ?? null; }
function storageApi() {
  if (!window?.HackhubSDK?.Storage) throw new Error("HackhubSDK.Storage unavailable");
  return window.HackhubSDK.Storage;
}

// ── Path helpers ─────────────────────────────────────────────────────

function _dirname(p: string) { const s = p.lastIndexOf("/"); return s <= 0 ? "/" : p.slice(0, s); }
function _basename(p: string) { const s = p.lastIndexOf("/"); return s >= 0 ? p.slice(s + 1) : p; }

// ── Files API ────────────────────────────────────────────────────────

export class FilesAPI {
  async cwd(): Promise<string> { return filesApi().getCurrentWorkingDirectory(); }
  async resolve(path: string, cwd?: string): Promise<string> {
    return filesApi().resolvePath(path, cwd ?? (await this.cwd()));
  }
  async exists(path: string): Promise<boolean> {
    return filesApi().exists(await this.resolve(path));
  }

  /** Open a file — info.data first (copy files), read(id) fallback. */
  async open(path: string): Promise<{ content: string; id: string } | null> {
    const F = filesApi();
    const info = await F.getByPath(await this.resolve(path));
    if (!info) return null;
    return { content: String(info.data ?? await F.read(info.id) ?? ""), id: info.id };
  }

  /** Save (overwrite). Uses remove+create — write() doesn't persist. */
  async save(path: string, content: string, knownId?: string): Promise<{ id: string }> {
    const F = filesApi();
    const abs = await this.resolve(path);
    let id = knownId ?? null;
    if (!id) { const i = await F.getByPath(abs); if (i) id = i.id; }
    if (id) { try { await F.remove(id); } catch {} }
    const name = _basename(abs);
    const dot = name.lastIndexOf(".");
    const n = dot > 0 ? name.slice(0, dot) : name;
    const e = dot > 0 ? name.slice(dot + 1) : "txt";
    const created = await F.create({ name: n, extension: e, data: content, parentPath: _dirname(abs) });
    return { id: created?.id ?? "" };
  }

  async list(dir: string): Promise<FileInfo[]> {
    const F = filesApi();
    const abs = dir === "/" ? "/" : await this.resolve(dir);
    if (abs === "/") { const root = await F.getRoot(); return root ? F.getChildren(root.id) : []; }
    const info = await F.getByPath(abs);
    return info?.isFolder ? F.getChildren(info.id) : [];
  }
}

// ── Events API ───────────────────────────────────────────────────────

export class EventsAPI {
  on(name: string, cb: (data: any) => void): () => void { return eventsApi().on(name, cb); }
  off(name: string, cb: (data: any) => void): void { eventsApi().off(name, cb); }
  emit(name: string, data?: any): void { eventsApi().emit(name, data); }
  register(name: string): void { eventsApi().register(name); }
}

// ── UI API ───────────────────────────────────────────────────────────

export class UIAPI {
  toast(text: string, kind?: string) { try { uiApi()?.toast(text, kind ?? "info"); } catch {} }
  notify(title: string, body?: string) { try { uiApi()?.notify(title, body); } catch {} }
}

// ── Storage API ─────────────────────────────────────────────────────

export class StorageAPI {
  get<T = any>(key: string): T | null { return storageApi().get(key); }
  set(key: string, value: any): void { storageApi().set(key, value); }
  getAll(): Record<string, any> { return storageApi().getAll(); }
  remove(key: string): void { storageApi().remove(key); }
  clear(): void { storageApi().clear(); }
}

// ── Unified export ───────────────────────────────────────────────────

export const sdk = {
  files: new FilesAPI(),
  events: new EventsAPI(),
  ui: new UIAPI(),
  storage: new StorageAPI(),
  get raw() { return window?.HackhubSDK ?? null; },
};
