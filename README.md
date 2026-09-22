# GraphiteAI

Describe a system in a chat. GraphiteAI answers with UML diagrams.

GraphiteAI is an AI agent for drawing UML diagrams. You describe a system in plain language, attach screenshots, specs or source files if you have them, and it answers with class, sequence, state, ER and activity diagrams. It draws them as [Mermaid](https://mermaid.js.org/) and checks that every diagram renders before you see it.

It runs entirely in your browser. There is no backend: projects, chats, diagrams and API keys are stored locally in IndexedDB, and requests go straight from your browser to the model provider you choose.

## Live Demo

You can view a hosted live demo of the GraphiteAI project at <https://graphite-ai.pages.dev/>

## Features

- **Chat to diagrams.** Each project has chat sessions. Diagrams in replies are saved to the project and drawn as SVG in the chat.
- **The agent works on its own.** Before answering, GraphiteAI can read the project's existing diagrams and check its drafts with Mermaid. A reply that contains a broken diagram goes back to the model to fix. While it works, you can watch its reasoning, tool calls and checks live, and stop it at any time.
- **Context.** Attach images, PDFs and text or source files, or reference diagrams already in the project.
- **Version history.** Every change to a diagram, whether by GraphiteAI or by you, is kept. Compare any version with the current one and restore it.
- **Edit and export.** Edit a diagram's Mermaid source with a live preview, rename it, and download it as SVG.
- **Bring your own model.** Supported providers:
  - **Anthropic** (Claude)
  - **Ollama** (local models)
  - **OpenAI-compatible** APIs: OpenAI, OpenRouter, Groq, Gemini, LM Studio and others

## Getting started

You need Node.js and npm.

```sh
git clone https://github.com/ahmed-bashaar/graphite-ai.git
cd graphite-ai
npm install
npm run dev
```

Open the URL Vite prints. The site root is the landing page; the app is at `/app`.

1. Go to **Settings** and add a provider. Enter its API key or server URL, pick a model ("Load models" lists what the provider offers) and save.
2. Create a project and start a new chat.
3. Describe your system, for example: *"An online shop: customers place orders of products; an order has line items, a payment and a shipment."*

Under Settings → Agent you can also set the maximum number of steps GraphiteAI may take per reply.

> **Note:** API keys are kept in your browser's IndexedDB and sent only to the provider they belong to. Because the app calls providers directly from the browser, only run it on a machine and browser profile you trust.

## Development

```sh
npm run dev       # dev server with hot reload
npm run build     # type-check (tsc -b), then build to dist/
npm run preview   # serve the production build
npm run lint      # ESLint
npm test          # Vitest in watch mode
npm run test:run  # Vitest, single run
```

The project is developed test-first: every feature or fix starts with a failing test. Tests sit next to the code they cover (`*.test.ts(x)`) and run in jsdom with an in-memory IndexedDB.

### Tech stack

React 19, TypeScript, Vite, Tailwind CSS v4, Motion, React Router, Dexie (IndexedDB), Mermaid, the Anthropic SDK, and Vitest with Testing Library.

### Project layout

```
src/
  lib/          framework-free domain model: chat sessions, the agent loop, LLM providers, rendering
  agent/        glue between the database, the providers and the agent: prompt, tools, replies
  pages/        route components
  components/   shared UI components and hooks
  routes.tsx    the route table
  db.ts         the Dexie database
  mutations.ts  cross-table writes (cascading deletes, diagram versions)
docs/uml/       the UML class diagram (StarUML model and rendered image)
```

The domain model in `src/lib/` follows the class diagram in [`docs/uml/`](docs/uml/Class.jpg), which serves as its spec. [`CLAUDE.md`](CLAUDE.md) describes the architecture and conventions in detail.
