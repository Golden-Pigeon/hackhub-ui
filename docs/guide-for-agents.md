# AGENTS.md — hh-ui framework reference for AI coding agents

## Project identity

hh-ui is a standalone virtual-DOM framework for HackHub Content SDK mod
development.  Mod projects consume it via `"hh-ui": "file:../hh-ui"` in
their `package.json`.

## Directory map

```
hh-ui/
├── src/                     # runtime code (bundled into mods)
│   ├── index.ts             # public API barrel
│   ├── vdom/
│   │   ├── types.ts         # VNode, Child, ComponentType
│   │   ├── h.ts             # h(), Fragment
│   │   ├── hooks.ts         # Fiber + useState/useEffect/useMemo/useCallback
│   │   ├── component.ts     # Component base class (OOP)
│   │   ├── mount.ts         # mountVNode + patchVNode + prop/child diff
│   │   ├── render.ts        # render(vnode, container)
│   │   └── scheduler.ts     # queueMicrotask batch scheduler
│   └── sdk/
│       └── index.ts         # Files, Events, UI, Storage wrappers
├── build/
│   └── index.ts             # buildMod() — the full build pipeline
├── README.md                # human docs
├── AGENTS.md                # this file
├── LICENSE                  # MIT
├── package.json
└── tsconfig.json
```

## Build pipeline in detail

`build/index.ts` exports `buildMod(root?: string)`:

1. **Discover** — scans `$root/src/apps/*/app.ts`
2. **Bundle** — esbuild each `app.ts` → IIFE JS string
   - bundler config: `{ format: "iife", platform: "browser", target: "es2020",
     jsx: "transform", jsxFactory: "h", jsxFragment: "Fragment", loader:
     {".tsx":"tsx", ".ts":"ts"} }`
   - no externals — the entire framework + app code is inlined
   - respects `--no-minify` flag
3. **CSS** — loads `$root/src/styles.ts` (must export `APP_CSS: string`)
4. **HTML** — template = `<!DOCTYPE html><html><head><meta …/><style>${css}</style></head><body><div id="root"></div><script>${js}</script></body></html>`
5. **Generate** — writes `$root/src/generated/apps.ts` with `@RegisterApp`
   declarations; each `App` subclass has `HTML` set to the generated html string
6. **Delegate** — calls the standard SDK `buildMod()` which bundles mod entry
   point + copies assets
7. **Preview** — copies individual `app.html` to `dist/apps/<name>/app.html`

## Mod project conventions

A mod consuming hh-ui MUST have:

| file                        | purpose                                           |
|-----------------------------|---------------------------------------------------|
| `src/index.ts`              | `@RegisterModPackage Bootstrap`, imports `./generated/apps` |
| `src/styles.ts`             | `export const APP_CSS = \`…\``                    |
| `src/generated/apps.ts`     | **auto-generated** by build — do not edit          |
| `src/apps/<Name>/app.ts`    | iframe entry: `render(h(App), root)`              |
| `src/apps/<Name>/App.tsx`   | root component                                    |
| `manifest.json`             | standard HackHub manifest                         |
| `esbuild.config.ts`         | `import { buildMod } from "hh-ui/build"; buildMod();` |
| `public/assets/`            | static assets (icons, covers)                     |

## VDOM internals

### VNode shape

```ts
interface VNode {
  tag: string | ((props) => VNode | null) | (abstract new (props) => ComponentInstance) | typeof Fragment;
  props: Record<string, any>;
  children: Child[];
  el?: Node;                // cached DOM node (host elements)
}
```

### Rendering flow

```
h(tag, props, ...kids) → VNode
  │
  ├─ mountVNode(vnode)     — first render: create DOM nodes, set vnode.el
  │   ├─ host element       → createElement + applyProps + mount children
  │   ├─ function component → getFiber → renderWithHooks → comp(props) → mount output
  │   ├─ class component    → getFiber → new Ctor(props) → inst.render() → mount output
  │   └─ Fragment           → document fragment → mount children
  │
  └─ patchVNode(old, new)  — incremental update: diff + DOM mutation
      ├─ tag changed        → replaceNode (full unmount + remount)
      ├─ component          → patchComponent (update props, re-render, diff output)
      └─ host element       → reuse el, diff props (applyProps), diff children
```

### Fiber (component state storage)

Each component VNode gets a `Fiber` (stored as `vnode._fiber`):

```ts
interface Fiber {
  vnode: VNode;
  hooks: HookEntry[];       // indexed by call order (React model)
  rendered: VNode | null;   // last rendered tree
  rendering: boolean;
  instance?: ComponentInstance;  // set for class components
}
```

- **Function components**: hooks array stores state/effext/memo/callback entries
- **Class components**: `instance` field holds the Component subclass instance; state lives on `instance.state`

### Hook rules (same as React)

- Hooks MUST be called unconditionally, in the same order every render
- Calling `setState` / `this.setState` schedules a microtask-batched re-render
- Effects run after render commit, skipped if deps haven't changed

### Prop diffing

`applyProps(el, oldProps, newProps, isSVG)`:
- `on*` keys → `addEventListener` / `removeEventListener`
- `className` → `class` attribute
- `style` object → `style.cssText`
- `value`/`checked` → direct property assignment
- `false`/`null`/`undefined` → attribute removed
- `true` → boolean attribute

### Child diffing

`patchChildren(parent, oldCh, newCh)`:
- Index-based comparison (no key reconciliation)
- `null ↔ VNode` transitions handled (mount/remove)
- Text ↔ Element transitions handled (replaceChild)
- Same-type VNodes → recursive patchVNode

## SDK wrapper: known pitfalls

All numbered pitfalls are documented below.

| # | symptom | solution baked in |
|---|---------|-------------------|
| 1 | App.Exports calls `Files.*` → mod identity lost (mod "null") | All calls go through `window.HackhubSDK` global, never through Exports |
| 2 | `Files.write(id)` doesn't persist | `save()` uses `remove(id) + create()` |
| 3 | `getByPath → id → read` round-trip unreliable; copy files share same id | `open()` uses `info.data` first, `read(id)` only as fallback |
| 4 | `rename(id, name)` only changes name part, extension is kept | `splitPath()` handles name/extension separation |
| 5 | No browser console for mods | Use `sdk.ui.toast()` or render errors in-app |
| 8 | Copy files (notes (1).txt) share same internal id | `info.data` is per-path; `open()` prefers it over `read(id)` |
| 10 | Event callbacks doing file IO → self-excitation loop → game freeze | `EventsAPI` docs warn; callers must buffer to memory, save on user action |

### SDK API surface

```ts
// Files
sdk.files.cwd(): Promise<string>
sdk.files.resolve(path: string, cwd?: string): Promise<string>
sdk.files.exists(path: string): Promise<boolean>
sdk.files.open(path: string): Promise<{ content: string; id: string } | null>
sdk.files.save(path: string, content: string, knownId?: string): Promise<{ id: string }>
sdk.files.list(dir: string): Promise<FileInfo[]>

// Events (never do file IO in callbacks)
sdk.events.on(name: string, cb: (data: any) => void): () => void   // returns unsubscribe fn
sdk.events.off(name: string, cb: (data: any) => void): void
sdk.events.emit(name: string, data?: any): void
sdk.events.register(name: string): void

// UI
sdk.ui.toast(text: string, kind?: string): void
sdk.ui.notify(title: string, body?: string): void

// Storage (verified up to 4 MB)
sdk.storage.get<T>(key: string): T | null
sdk.storage.set(key: string, value: any): void
sdk.storage.getAll(): Record<string, any>
sdk.storage.remove(key: string): void
sdk.storage.clear(): void
```

## Security review compliance

The entire runtime (framework + generated app code) uses only:
- Standard DOM APIs (`createElement`, `setAttribute`, `addEventListener`, …)
- Standard ES2020 (`Promise`, `Set`, `Array.from`, `queueMicrotask`)
- No `eval`, `new Function()`, dynamic `import()`, `innerHTML` (set via text nodes)

Generated `app.html` contains a single `<script>` with an IIFE — no external
scripts, no `src` attributes.

## Testing / preview

App HTML can be previewed without the game:

```bash
chrome --headless --screenshot=preview.png "file://$PWD/dist/apps/MyApp/app.html"
```

SDK calls (`HackhubSDK.*`) will fail in this context.  The app should render its
UI gracefully with empty/error states.

## Common bugs when modifying framework code

1. **children not in props**: When calling a function component, children are on
   `vnode.children`, not `vnode.props`.  Use `buildProps(vnode)` which merges them.
   Both `mountFunctionComponent` and `scheduleFiberRender` must use `buildProps`.

2. **null-child branch in patchChild**: `patchChild` must handle `null → VNode`
   (mount new) and `VNode → null` (remove old).  Missing branches cause
   conditional children (like `{debug && <span>}`) to never render.

3. **JSDoc `*/` in paths**: Don't write literal `*/` inside `/** */` comments.
   The parser treats it as comment-end.  Use `{name}` or backslash-escape.

4. **setter placeholder truthy**: The `useState` hook placeholder must use
   `setter: null`, not `() => {}`.  The check `if (!entry.setter)` fails on
   truthy placeholders.

5. **esbuild jsx config**: The build module's `bundleApp` must include
   `{ jsx: "transform", jsxFactory: "h", jsxFragment: "Fragment" }`.
   Otherwise JSX compiles to `React.createElement` which doesn't exist.
