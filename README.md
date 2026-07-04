# hackhub-ui

Lightweight JSX virtual-DOM framework for
[HackHub](https://store.steampowered.com/app/2980270/) mod development.
Hooks, class components, and an SDK wrapper that handles every known
Content SDK pitfall internally.

## Install

```bash
npm install -D github:Golden-Pigeon/hackhub-ui
```

Or in `package.json`:

```json
"devDependencies": { "hh-ui": "github:Golden-Pigeon/hackhub-ui" }
```

Peer deps: `@hotbunny/hackhub-content-sdk`, `esbuild`, `tsx`, `typescript`.

## Usage

```tsx
// src/apps/MyApp/app.ts
import { h, render } from "hh-ui";
const App = () => <div>Hello HackHub</div>;
render(<App/>, document.getElementById("root")!);
```

```ts
// esbuild.config.ts
import { buildMod } from "hh-ui/build";
buildMod();
```

```bash
npx tsx esbuild.config.ts
```

## Docs

→ [User guide](docs/guide.md) — full API reference, project structure, pitfalls, deployment
→ [AI agent reference](docs/guide-for-agents.md) — module map, internals, known bugs

## License

MIT
