# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

Graphite AI is at the scaffold stage: the UI in `src/App.tsx` is still the Vite `react-ts` template (React 19, TypeScript ~6, Vite 8), with Tailwind, Motion, Dexie, and Vitest wired in but not yet used by real features. The intended application design exists only as a UML class diagram in `docs/uml/` — treat that as the spec when building out real code.

## Commands

```sh
npm install
npm run dev       # Vite dev server with HMR
npm run build     # tsc -b (type-check all project references) then vite build → dist/
npm run lint      # eslint . (flat config in eslint.config.js)
npm test          # Vitest in watch mode
npm run test:run  # Vitest single run (CI)
npx vitest run src/db.test.ts   # run one file; add -t "<name>" to filter by test name
npm run preview   # serve the production build
```

## Libraries

- **Tailwind CSS v4** via the `@tailwindcss/vite` plugin — there is no `tailwind.config.js` or PostCSS config. `src/index.css` starts with `@import "tailwindcss";`; customize with `@theme` blocks in CSS, not a JS config. Preflight is active, so the leftover template styles in `index.css`/`App.css` sit on top of Tailwind's reset.
- **Motion** (formerly Framer Motion) — import from `motion/react` (not `framer-motion`). `src/main.tsx` wraps the app in `<MotionConfig reducedMotion="user">`, so animations respect the OS reduced-motion setting.
- **Dexie** (IndexedDB) — the single database instance lives in `src/db.ts` as `db`, typed with `EntityTable`. Tables mirror the UML: `projects`, `chatSessions`, `messages`, `diagrams`. MessageParts are composed by their Message and stored inline in `messages.parts` (a `type`-discriminated union), not in their own table. The `stores()` strings list only the primary key and indexed fields. To change the schema, add a new `db.version(n + 1).stores(...)`; don't edit the existing version.

## Testing

- Vitest config is the `test` block in `vite.config.ts`: `jsdom` environment, setup file `src/test/setup.ts`. Tests sit next to their source as `*.test.ts(x)`.
- Globals are **off**: import `describe`/`it`/`expect`/`vi` from `vitest`. The setup file registers jest-dom matchers and calls Testing Library's `cleanup` after each test.
- The setup file also imports `fake-indexeddb/auto`, so Dexie runs in memory during tests. Reset state between tests with `await db.delete(); await db.open()` (see `src/db.test.ts`).
- Use `@testing-library/react` plus `@testing-library/user-event` for component tests.
- Test files are under `src/`, so `tsc -b` (and therefore `npm run build`) type-checks them too.

## Tooling notes

- TypeScript uses project references: `tsconfig.app.json` covers `src/` (browser code), `tsconfig.node.json` covers `vite.config.ts`. `tsc -b` is the only type-check; `vite build`/`vite dev` do not type-check.
- `tsconfig.app.json` enables `verbatimModuleSyntax` (use `import type` for type-only imports), `erasableSyntaxOnly` (no `enum`, `namespace`, or constructor parameter properties — use union types / `as const` objects instead), `allowImportingTsExtensions` (imports like `./App.tsx` are fine), and `noUnusedLocals`/`noUnusedParameters`.
- ESLint: `@eslint/js` + `typescript-eslint` recommended (not type-aware), `react-hooks`, and `react-refresh` (component files should only export components, for HMR).

## Intended architecture (from `docs/uml/`)

`docs/uml/graphite-ai-uml.mdj` is a StarUML model; `docs/uml/Class.jpg` is its rendered class diagram. Update both if the design changes. The planned domain model is an AI chat app that produces diagrams:

- **Project** composes **ChatSession**s and **Diagram**s.
- **ChatSession** holds a `draft` and composes **Message**s (`sender`, `on`, `isSent`); each Message composes **MessagePart**s (`type`, `content`). **DiagramReference** is a MessagePart subtype that points at a Diagram.
- **AiAgent** (`respond(message)`) is attached to a ChatSession, aggregates one **LlmModel** and a set of **AgenticTool**s (`name`, `description`, `call(args)`).
- **LlmProvider** (`provideModel(args)`) composes LlmModels. LlmProvider and AgenticTool implement **Parametered** (`exposeParameters()`), i.e. they describe their own configurable arguments.
- **Renderable** (`render()`) is implemented by Message, MessagePart, and Diagram. Its purpose: convert ASCII-based formats the LLM produces (JSON, XML, Markdown) into browser-native output (HTML, CSS, SVG).
- **EventEmitter** (`on`/`off`/protected `emit`) drives the chat loop: the ChatSession depends on it, and the agent learns when to respond via emitted events rather than direct calls, so multiple messages can go back and forth asynchronously.
