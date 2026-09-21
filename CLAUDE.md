# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Goal

The goal of this project is to build an AI agent that creates UML diagrams. The agent is called **GraphiteAI**. Users describe a system in a chat and GraphiteAI answers with UML diagrams.

## Project state

Graphite AI is at an early stage (React 19, TypeScript ~6, Vite 8, Tailwind, Motion, Dexie, React Router, Vitest). The front-end shell is built (see "Front-end" below): users can create projects, open chat sessions and send messages, and view diagrams. In Settings they can configure LLM providers (Anthropic, Ollama, OpenAI-compatible). Sending a chat message gets a reply from the chat's provider. Mermaid blocks in replies are saved as project diagrams, drawn as SVG with Mermaid in the chat and on the diagram page, where the source can be edited and the SVG downloaded. The domain model from the UML class diagram in `docs/uml/` is implemented in `src/lib/` as framework-free TypeScript (no React imports), re-exported from `src/lib/index.ts`. Treat the UML as the spec when extending it.

## Development workflow

- **Test-driven development (TDD) is required.** For every feature or bug fix, write a failing test first, confirm it fails for the expected reason, then write the minimum code to make it pass, then refactor with the tests green (red → green → refactor). Don't write production code without a test that demands it.
- **Keep this file current.** After every change, update CLAUDE.md so it reflects the new state of the project (commands, libraries, architecture, conventions, project state). Include the CLAUDE.md update in the same commit as the change.

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
- **Dexie** (IndexedDB) — the single database instance lives in `src/db.ts` as `db`, typed with `EntityTable`. Tables mirror the UML: `projects`, `chatSessions` (`title`, `draft`, optional `providerId`), `messages`, `diagrams` (`type`, `name`, `source`, matching `Diagram` in `src/lib`). MessageParts are composed by their Message and stored inline in `messages.parts` (a `type`-discriminated union of `text`, `code` and `diagram-reference`), not in their own table. The `stores()` strings list only the primary key and indexed fields. Adding non-indexed fields needs no version bump. To change indexes, add a new `db.version(n + 1).stores(...)`; don't edit the existing version.
- **dexie-react-hooks** — components read the database with `useLiveQuery`, so the UI re-renders when any write lands (no manual refetching). A live query returns `undefined` while loading. Pages that must tell "loading" from "missing" return `(await table.get(id)) ?? null`, where `null` means not found.
- **React Router v8** (`react-router` package; there's no `react-router-dom`). Data-router style: the route table is `routes` in `src/routes.tsx`. `App.tsx` passes it to `createBrowserRouter`, and tests pass it to `createMemoryRouter`. Import everything, including `RouterProvider`, from `react-router`.
- **Mermaid** (v12): draws diagrams. Only `src/components/renderMermaid.ts` touches it. It lazy-loads the library (separate chunk), uses `securityLevel: 'strict'` (sanitized SVG, safe to inject), and picks a dark/neutral theme from `prefers-color-scheme`. Components use `useMermaid(source)` (`loading` / `done` + `svg` / `error`) and `<MermaidSvg>` to show the result, falling back to the error and source. jsdom can't run Mermaid, so `src/test/setup.ts` mocks `renderMermaid` globally with an SVG that echoes the source (`data-testid="mermaid-svg"`); override it per test with `vi.mocked(renderMermaid)`. `npm audit` reports lodash-es advisories through Mermaid's parser dependency (chevrotain); the only "fix" is downgrading Mermaid.
- **@anthropic-ai/sdk**: `AnthropicProvider` uses the official SDK (not raw fetch), with `dangerouslyAllowBrowser: true` because the app has no backend and users bring their own key. Ollama and OpenAI-compatible providers use plain `fetch` through `src/lib/http.ts` (`requestJson`, `joinUrl`). Before touching Claude API code, load the `claude-api` skill; model IDs, beta headers and parameters change often.

## Testing

- Vitest config is the `test` block in `vite.config.ts`: `jsdom` environment, setup file `src/test/setup.ts`. Tests sit next to their source as `*.test.ts(x)`.
- Globals are **off**: import `describe`/`it`/`expect`/`vi` from `vitest`. The setup file registers jest-dom matchers and calls Testing Library's `cleanup` after each test.
- The setup file also imports `fake-indexeddb/auto`, so Dexie runs in memory during tests. Reset state between tests with `await db.delete(); await db.open()` (see `src/db.test.ts`).
- Use `@testing-library/react` plus `@testing-library/user-event` for component tests.
- Agent tests (`src/agent/conversation.test.ts`) seed an Ollama provider and stub `fetch` to act as its server; type the mocks with `vi.fn<FetchLike>` so `mock.calls` type-checks.
- Page and route tests live in `src/routes.test.tsx` and `src/settings.test.tsx`. They use `renderAt(path)` and `expectPath(router, path)` from `src/test/router.tsx`, and seed Dexie directly. After any navigation (`router.navigate`, or a click followed by `expectPath`), use `findBy*` for the next query, never `getBy*`: the URL changes before React commits the new page, and the old page may still be mounted. Provider tests (`src/lib/providers.test.ts`) inject a fake `fetch` and never hit the network. UI tests that need network stub `fetch` with `vi.stubGlobal` and restore it with `vi.unstubAllGlobals()`. Reset the db in `beforeEach`, not `afterEach`: an `afterEach` reset runs before Testing Library's cleanup, while live queries are still mounted.
- `src/lib/` tests use a stub `LlmModel` subclass (see `ChatSession.test.ts`). Agent replies are async, so wait with `vi.waitFor(() => expect(session.messages).toHaveLength(n))`.
- Test files are under `src/`, so `tsc -b` (and therefore `npm run build`) type-checks them too.

## Tooling notes

- TypeScript uses project references: `tsconfig.app.json` covers `src/` (browser code), `tsconfig.node.json` covers `vite.config.ts`. `tsc -b` is the only type-check; `vite build`/`vite dev` do not type-check.
- `tsconfig.app.json` enables `verbatimModuleSyntax` (use `import type` for type-only imports), `erasableSyntaxOnly` (no `enum`, `namespace`, or constructor parameter properties — use union types / `as const` objects instead), `allowImportingTsExtensions` (imports like `./App.tsx` are fine), and `noUnusedLocals`/`noUnusedParameters`.
- ESLint: `@eslint/js` + `typescript-eslint` recommended (not type-aware), `react-hooks`, and `react-refresh` (component files should only export components, for HMR).

## Architecture (from `docs/uml/`, implemented in `src/lib/`)

`docs/uml/graphite-ai-uml.mdj` is a StarUML model; `docs/uml/Class.jpg` is its rendered class diagram. Update both if the design changes. `Class.jpg` is the source of truth: the `.mdj` also contains stale elements that are not on the diagram (TextRenderer, RenderableAscii, Eventful, EventListener, Referencable, MessageBlock). Don't implement those. The domain model is an AI chat app that produces diagrams:

- **Project** composes **ChatSession**s and **Diagram**s.
- **ChatSession** holds a `draft` and composes **Message**s (`sender`, `on`, `isSent`); each Message composes **MessagePart**s (`type`, `content`). **DiagramReference** is a MessagePart subtype that points at a Diagram.
- **AiAgent** (`respond(message)`) is attached to a ChatSession, aggregates one **LlmModel** and a set of **AgenticTool**s (`name`, `description`, `call(args)`).
- **LlmProvider** (`provideModel(args)`) composes LlmModels. LlmProvider and AgenticTool implement **Parametered** (`exposeParameters()`), i.e. they describe their own configurable arguments.
- **Renderable** (`render()`) is implemented by Message, MessagePart, and Diagram. Its purpose: convert ASCII-based formats the LLM produces (JSON, XML, Markdown) into browser-native output (HTML, CSS, SVG).
- **EventEmitter** (`on`/`off`/protected `emit`) drives the chat loop: the ChatSession depends on it, and the agent learns when to respond via emitted events rather than direct calls, so multiple messages can go back and forth asynchronously.

### How `src/lib/` maps onto the UML

One file per class/interface, named after it. Places where the code intentionally differs from or adds to the diagram:

- `ChatSession` **extends** `EventEmitter<ChatSessionEvents>` (events: `message`, `draft`, `error`); a subclass is the only way to call the protected `emit`.
- UML `draft(message)` is `setDraft(message)`, because TS can't have a property and a method named `draft`. `send(message = this.draft)` marks the message as sent, stamps `on`, appends it and emits `message`.
- `AiAgent.attach(session)` subscribes to `message` and replies via `session.send(reply)`, ignoring its own messages. `ChatSession.setAgent()` handles attach/detach. Agent failures surface as the session's `error` event.
- `LlmModel` and `LlmProvider` are abstract. `LlmModel.complete(history, tools, instructions?)` is the extension point where a provider's API call and tool-calling loop live. It is not in the UML. `instructions` is the system prompt; `AiAgent` holds one (4th constructor argument, not in the UML) and passes it on every call.
- `LlmProvider` also has `listModels(args)` (not in the UML), used by Settings to suggest model names. Its constructor takes `{ fetch }` so tests can inject a stub. `withDefaults(args)` fills in parameter defaults, and `requireArgs(args)` also throws on missing required settings; `provideModel` uses `requireArgs`.
- Concrete providers: `AnthropicProvider`, `OllamaProvider`, `OpenAiCompatibleProvider` (OpenAI, OpenRouter, Groq, LM Studio, ...). Each file also holds its private `LlmModel` subclass. `toChatTurns(history)` (`chatTurns.ts`) maps Messages to `{ role, content }` turns: sender `'user'` is the user, anyone else is the assistant. `DiagramReference` parts become fenced ```` ```mermaid ```` source, so the model sees (and can revise) earlier diagrams. `withSystem()` prepends a system turn for APIs that take it as a message. Tools are not sent to any provider yet.
- `parseReply(text)` (`parseReply.ts`) splits a Markdown reply into `text`, `code` and `diagram` segments. A ```` ```mermaid ```` block is a diagram named by its frontmatter `title:`; `diagramTypeOf()` maps the Mermaid header keyword to a UML type (`class`, `sequence`, `state`, `er`, `activity`, else `mermaid`).
- The Anthropic model sends `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`) only for `claude-opus-5` and `claude-fable-5-1`, and throws on `stop_reason: "refusal"`. Default model: `claude-opus-5`.
- `AgenticTool` is concrete, built from `{ name, description, parameters, handler }`, and `call()` validates required args. Parameter shape: `Parameter` in `Parametered.ts`, which adds optional `secret` (mask it in UIs) and `default` to the UML.
- `render()` returns an HTML string. Always pass LLM-produced text through `escapeHtml` (`Renderable.ts`). `MessagePart` renders `text` as Markdown with `renderMarkdown()` (`markdown.ts`: a small subset covering paragraphs, headings, lists, quotes, rules, tables, emphasis, inline code and http(s)/mailto links; everything is escaped first) and `code` as an escaped `<pre>`, and `Diagram.render()` (which adds a `source` field) returns its escaped source, because Mermaid rendering is async and lives in the UI layer (`renderMermaid`).

## Agent (`src/agent/`)

The app-side glue between Dexie, providers and the `src/lib` agent. It is React-free.

- `instructions.ts`: `AGENT_NAME` (`'GraphiteAI'`, the sender of agent messages) and `INSTRUCTIONS`, the system prompt. GraphiteAI draws diagrams as titled Mermaid blocks, so any model can produce them without tool calling. A diagram output again with the same title (case-insensitive) replaces the stored one.
- `conversation.ts`: `sendMessage(chatSessionId, text)` stores the user message (renaming a `NEW_CHAT_TITLE` chat after it) and then calls `reply(chatSessionId)`. `reply` answers only an unanswered last user message. It loads the history and project diagrams, runs them through a `ChatSession` + `AiAgent` (the agent reacts to the session's `message` event, following the UML), and saves the reply with `parseReply`: diagrams are upserted by name into the project and referenced from the message. It remembers the provider on the chat (`providerId`). With no provider configured it throws `NoProviderError`. Provider errors propagate to the caller.
- `chatTitle.ts`: `NEW_CHAT_TITLE`, `titleFrom()`.

## Front-end (`src/routes.tsx`, `src/pages/`, `src/components/`)

The main user journey starts on the projects page. Inside a project, the user works with chat sessions and diagrams. The layout follows the user's wireframe: a sidebar on the left, a top bar, and the chat in the middle, with agent messages on the left, user messages on the right, and the input bar at the bottom.

| Path | Component | What it shows |
| --- | --- | --- |
| `/` | `ProjectsPage` | Project list and create form; creating a project opens it |
| `/projects/:projectId` | `ProjectLayout` | Shell: sidebar (brand link to `/`, "New chat", chat and diagram `NavLink`s) and a top bar with the project name, around an `<Outlet>` |
| ↳ index | `ProjectHome` | Empty-state hint |
| ↳ `chats/:chatId` | `ChatPage` → `Chat` (keyed by chat id) | Messages ordered by the `[chatSessionId+on]` index. Replies show a "thinking" status (`role="status"`), errors show an alert with Retry (`reply()`), and an unanswered last message also offers Retry. Diagram parts render as cards with a live Mermaid preview, linking to the diagram. The composer has a Model picker (the chat's provider; defaults to the first provider) or an "Add a provider" link when none exist. Enter sends, Shift+Enter adds a newline |
| ↳ `diagrams/:diagramId` | `DiagramPage` → `DiagramView` | The Mermaid SVG under the diagram name and type label (`diagramTypeLabel`). "Edit source" opens a textarea with a live preview (Save writes the source). "Download SVG" is a `data:` link |
| `/settings` | `SettingsLayout` → `SettingsPage` | Configured providers, and cards for adding each provider kind |
| ↳ `providers/new/:kind`, `providers/:providerId` | `ProviderPage` | Add or edit form built from the provider's `exposeParameters()`: secret → password input, and a "Load models" button that calls `listModels` and fills a `<datalist>`. Save validates with `provideModel()`. Edit mode also has Remove |
| `*` | `NotFound` | Also used for a missing project, chat, diagram, or provider |

- The provider kinds a user can configure are listed in `src/providers.ts` (`providerKinds`: label, description, factory). To add a provider, write the `LlmProvider` in `src/lib` and register it there. Configured providers live in the Dexie `providers` table (schema version 2): `{ kind, name, args }`.
- `AppHeader` (brand + Settings link) tops the projects and settings pages. Inside a project, Settings is at the bottom of the sidebar.
- Messages from sender `'user'` are the user's. Any other sender is treated as the agent (`data-sender="agent"`).
- Style `renderMarkdown` output with `markdownStyles` (`components/markdownStyles.ts`), applied to the text part's `RenderedHtml` only, so it doesn't leak into diagram cards. `ChatPage` stays scrolled to the bottom while async content (diagram previews) grows, via a `ResizeObserver` that is skipped in jsdom, unless the user has scrolled up.
- Render LLM content through `src/lib` Renderables with `<RenderedHtml of={...}>`, never as raw strings. The exception is diagram SVGs, which come from Mermaid's strict mode (see Libraries). `MessagePart` and `Diagram` escape their input. Style the generated markup with Tailwind arbitrary child variants (`[&_pre]:...`).
- Styling uses Tailwind only, with a zinc ("graphite") palette. Dark mode uses `dark:` variants, which follow the OS setting. There are no component CSS files; `src/index.css` holds only the Tailwind import and base styles. The logo mark is `components/Logo.tsx`, and `public/favicon.svg` is the same mark.
