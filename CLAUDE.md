# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

Graphite AI is at the scaffold stage: `src/` is still the unmodified Vite `react-ts` template (React 19, TypeScript ~6, Vite 8). The intended application design exists only as a UML class diagram in `docs/uml/` — treat that as the spec when building out real code.

## Commands

```sh
npm install
npm run dev       # Vite dev server with HMR
npm run build     # tsc -b (type-check all project references) then vite build → dist/
npm run lint      # eslint . (flat config in eslint.config.js)
npm run preview   # serve the production build
```

There is no test runner configured yet. If one is added, Vitest fits the existing Vite toolchain.

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
