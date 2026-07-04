# hh-ui — User Guide

## Table of contents

- [Quick start](#quick-start)
- [Project structure](#project-structure)
- [VDOM API](#vdom-api)
  - [Function components + hooks](#function-components--hooks)
  - [Class components (OOP)](#class-components-oop)
  - [Hooks reference](#hooks-reference)
- [SDK wrapper](#sdk-wrapper)
  - [Files](#files)
  - [Events](#events)
  - [UI](#ui)
  - [Storage](#storage)
- [Known SDK pitfalls](#known-sdk-pitfalls)
- [Build pipeline](#build-pipeline)
- [Preview without the game](#preview-without-the-game)
- [Deployment](#deployment)

## Quick start

```bash
mkdir my-mod  &&  cd my-mod
npm init -y
npm install -D @hotbunny/hackhub-content-sdk esbuild tsx typescript
npm install -D ../path/to/hh-ui         # or "hh-ui": "file:../hh-ui" in package.json
```

### Minimal esbuild config

```ts
// esbuild.config.ts
import { buildMod } from "hh-ui/build";
buildMod();
```

### Minimal app entry (iframe bootstrap)

```ts
// src/apps/MyApp/app.ts
import { h, render } from "hh-ui";
import { App } from "./App";

render(h(App), document.getElementById("root")!);
```

## Project structure

```
my-mod/
├── manifest.json              # HackHub manifest
├── tsconfig.json
├── esbuild.config.ts          # import { buildMod } from "hh-ui/build"; buildMod();
├── src/
│   ├── index.ts               # @RegisterModPackage Bootstrap
│   ├── styles.ts              # export const APP_CSS = `…`;
│   └── apps/
│       └── MyApp/
│           ├── app.ts          # iframe entry
│           ├── App.tsx          # root component
│           └── components/
│               └── …
└── public/
    └── assets/
        ├── icon.svg
        └── cover.svg
```

## VDOM API

### Function components + hooks

```tsx
import { h, useState, useEffect } from "hh-ui";

const Counter = () => {
  const [count, setCount] = useState(0);
  useEffect(() => { console.log("count changed:", count); }, [count]);
  return (
    <div>
      <span>{count}</span>
      <button onClick={() => setCount(c => c + 1)}>+1</button>
    </div>
  );
};
```

### Class components (OOP)

```tsx
import { Component } from "hh-ui";

class Counter extends Component<{}, { count: number }> {
  initialState() { return { count: 0 }; }
  render() {
    return (
      <div>
        <span>{this.state.count}</span>
        <button onClick={() => this.setState({ count: this.state.count + 1 })}>+1</button>
      </div>
    );
  }
}
```

Class components support:
- `this.state` — current state (initialised by `initialState()`)
- `this.setState(partial)` — shallow-merge partial and re-render
- `this.setState(prev => partial)` — updater form
- `this.props` — current props (updated automatically on parent re-render)
- `componentDidMount()` / `componentDidUpdate()` / `componentWillUnmount()` — lifecycle hooks

### Hooks reference

| hook | signature | notes |
|------|-----------|-------|
| `useState` | `[value, setter] = useState(initial)` | `setter` accepts value or updater function |
| `useEffect` | `useEffect(cb, deps?)` | runs after render commit; skipped if deps unchanged. `cb` may return a cleanup function |
| `useMemo` | `value = useMemo(factory, deps)` | recomputes only when deps change |
| `useCallback` | `fn = useCallback(fn, deps)` | stable function reference across renders |

Hook rules: call them unconditionally at the top level of a component function, in the same order every render (identical to React's rules).

### Component base class

```ts
abstract class Component<P = {}, S = {}> {
  props: P;
  state: S;

  abstract render(): VNode | null;
  initialState(): S;

  setState(update: Partial<S> | ((prev: S) => Partial<S>)): void;

  componentDidMount(): void;
  componentDidUpdate(): void;
  componentWillUnmount(): void;
}
```

## SDK wrapper

```ts
import { sdk } from "hh-ui";
```

### Files

```ts
// Open a file (return null if not found)
const { content, id } = await sdk.files.open("~/readme.txt");

// Save / overwrite (handles write-doesnt-persist bug)
const { id } = await sdk.files.save("~/readme.txt", "new content");

// List a directory
const files: FileInfo[] = await sdk.files.list("~");
// FileInfo: { id, name, extension?, isFolder?, data?, … }

// Check if a file exists
const exists = await sdk.files.exists("~/readme.txt");

// Current working directory (falls back to home in desktop apps)
const cwd = await sdk.files.cwd();
```

### Events

```ts
// Subscribe — returns unsubscribe function
const unsub = sdk.events.on("Terminal.Command", (data) => {
  console.log(data.command, data.args);
});

// Unsubscribe
sdk.events.off("Terminal.Command", callback);

// Emit a custom cross-mod event
sdk.events.emit("MyMod.ScoreUpdated", { score: 100 });
```

**Critical warning**: Never do file I/O inside event callbacks. Writing a file
triggers `Files.*` events → callback fires again → infinite loop → game freeze.
Only update in-memory state in callbacks. Save on user action or a throttled timer.

### UI

```ts
sdk.ui.toast("File saved", "success");
sdk.ui.notify("Title", "Body text");
```

### Storage

```ts
sdk.storage.set("highScore", 42);
const score = sdk.storage.get<number>("highScore");
const all = sdk.storage.getAll();
sdk.storage.remove("highScore");
sdk.storage.clear();
```

Storage is verified to work reliably up to at least 4 MB per key.

## Known SDK pitfalls

All of these are handled internally by the SDK wrapper — you don't need to work
around them in your app code.  They're documented here so you know what's
happening under the hood.

1. **App.Exports lose mod identity** — if an `App.Exports` function calls
   `Files.*`, the SDK sees mod `"null"` and denies filesystem permission.
   All SDK calls in hh-ui go through `window.HackhubSDK` global directly.

2. **`Files.write(id)` doesn't persist** — `sdk.files.save()` uses
   `remove(id) + create()` instead.

3. **Id round-trip unreliable** — `getByPath(id) → read(id)` can return
   data from a different file.  `sdk.files.open()` uses `info.data` first
   (which is per-path), only falling back to `read(id)`.

4. **`rename` only changes the name part** — extension is preserved
   separately.  The wrapper's `save()` method handles name/extension split.

5. **No dev console** — `console.log` output goes nowhere in-game.
   Use `sdk.ui.toast()` or render debug info directly in your app UI.

6. **Copy files share the same internal id** — the game auto-appends
   ` (1)`, ` (2)` suffixes on filename collision, but the SDK assigns
   identical ids to all copies.  `info.data` (from `getByPath`) correctly
   distinguishes them; the wrapper uses it.

7. **Event self-excitation** — `Files.*` events fire on any file write,
   including writes inside the callback.  Never do file I/O in event
   handlers; buffer to memory and save on user action.

## Build pipeline

`npm run build` runs `tsx esbuild.config.ts` which:

1. Discovers apps under `src/apps/*/app.ts`
2. Bundles each entry → IIFE JS string (framework + all components inlined)
3. Injects JS + shared CSS from `src/styles.ts` → `app.html`
4. Generates `@RegisterApp` declarations → `src/generated/apps.ts`
5. Delegates to the standard SDK `buildMod()` → `dist/mod.js`
6. Copies individual `app.html` files to `dist/apps/<name>/app.html`

## Preview without the game

```bash
chrome --headless --disable-gpu --hide-scrollbars \
  --window-size=800,600 \
  --screenshot=preview.png \
  "file://$PWD/dist/apps/MyApp/app.html"
```

SDK calls (`HackhubSDK.*`) will fail in the browser context.  Your app should
handle this gracefully by displaying empty/error UI states.

## Deployment

```bash
# Build
npm run build

# Copy to game mods directory
rm -rf "<game-mods>/my-mod-id"
cp -R dist/ "<game-mods>/my-mod-id"

# In-game: disable → re-enable the mod to reload
```
