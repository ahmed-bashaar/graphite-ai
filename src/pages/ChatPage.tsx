import { useLiveQuery } from 'dexie-react-hooks'
import { motion } from 'motion/react'
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { NoProviderError, reply, sendMessage, type ContextPart } from '../agent/conversation.ts'
import { stopReply } from '../agent/replies.ts'
import { AgentWork } from '../components/AgentWork.tsx'
import { AddContext, ContextChips, SentAttachment, SentDiagramReference } from '../components/ChatContext.tsx'
import { Avatar } from '../components/Avatar.tsx'
import { ConfirmDelete } from '../components/ConfirmDelete.tsx'
import { EditableTitle } from '../components/EditableTitle.tsx'
import { MermaidSvg } from '../components/MermaidSvg.tsx'
import { RenderedHtml } from '../components/RenderedHtml.tsx'
import { markdownStyles } from '../components/markdownStyles.ts'
import { readAttachment } from '../components/readAttachment.ts'
import { useMermaid } from '../components/useMermaid.ts'
import { useReplyProgress } from '../components/useReplyProgress.ts'
import { db, type MessagePartRecord, type MessageRecord } from '../db.ts'
import { diagramTypeLabel, MessagePart, parseReply, type AgentProgress } from '../lib/index.ts'
import { deleteChat } from '../mutations.ts'
import { NotFound } from './NotFound.tsx'

export function ChatPage() {
  const chatId = Number(useParams().chatId)
  // Keyed so pending/error state doesn't leak between chats.
  return <Chat key={chatId} chatSessionId={chatId} />
}

function Chat({ chatSessionId }: { chatSessionId: number }) {
  const session = useLiveQuery(
    async () => (await db.chatSessions.get(chatSessionId)) ?? null,
    [chatSessionId],
  )
  const messages = useLiveQuery(
    () =>
      db.messages
        .where('[chatSessionId+on]')
        .between([chatSessionId, new Date(0)], [chatSessionId, new Date(8.64e15)])
        .toArray(),
    [chatSessionId],
  )
  const providers = useLiveQuery(() => db.providers.toArray())
  const provider = providers?.find((p) => p.id === session?.providerId) ?? providers?.[0]
  const diagrams = useLiveQuery(
    async () => (session ? db.diagrams.where({ projectId: session.projectId }).sortBy('name') : []),
    [session?.projectId],
  )

  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [context, setContext] = useState<ContextPart[]>([])
  const [attachErrors, setAttachErrors] = useState<string[]>([])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  // A reply outlives this component, so it's tracked outside React; `pending` covers the moment before it starts.
  const progress = useReplyProgress(chatSessionId)
  const working = pending || progress !== undefined
  const scroller = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages?.length, working])

  // Diagram previews render asynchronously; stay pinned to the bottom while they grow,
  // unless the user has scrolled up.
  useEffect(() => {
    const el = scroller.current
    if (!el || !content.current || typeof ResizeObserver === 'undefined') return
    let pinned = true
    const onScroll = () => (pinned = el.scrollHeight - el.scrollTop - el.clientHeight < 80)
    const observer = new ResizeObserver(() => {
      if (pinned) el.scrollTop = el.scrollHeight
    })
    el.addEventListener('scroll', onScroll)
    observer.observe(content.current)
    return () => {
      el.removeEventListener('scroll', onScroll)
      observer.disconnect()
    }
  }, [])

  async function run(action: () => Promise<void>) {
    setPending(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(e)
    } finally {
      setPending(false)
    }
  }

  function send(event?: FormEvent) {
    event?.preventDefault()
    const content = text.trim()
    if ((!content && context.length === 0) || working || !provider) return
    const sending = context
    setText('')
    setContext([])
    setAttachErrors([])
    void run(() => sendMessage(chatSessionId, content, sending))
  }

  async function attach(files: File[]) {
    if (files.length === 0) return
    const results = await Promise.allSettled(files.map(readAttachment))
    const read = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
    setContext((parts) => [...parts, ...read])
    setAttachErrors(results.flatMap((r) => (r.status === 'rejected' ? [(r.reason as Error).message] : [])))
  }

  function referenceDiagram(diagramId: number) {
    setContext((parts) =>
      parts.some((p) => p.type === 'diagram-reference' && p.diagramId === diagramId)
        ? parts
        : [...parts, { type: 'diagram-reference', diagramId }],
    )
  }

  // Enter sends; Shift+Enter inserts a newline.
  function sendOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      send()
    }
  }

  if (session === null) return <NotFound what="Chat" />

  const unanswered = messages?.at(-1)?.sender === 'user'

  return (
    <div className="flex h-full flex-col">
      {session && (
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-zinc-100 px-6 dark:border-zinc-900">
          <EditableTitle
            value={session.title}
            noun="chat"
            fieldLabel="Chat title"
            onSave={async (title) => {
              await db.chatSessions.update(chatSessionId, { title })
            }}
            className="text-sm text-zinc-600 dark:text-zinc-300"
          />
          <div className="ml-auto">
            <ConfirmDelete
              noun="chat"
              onConfirm={async () => {
                await deleteChat(chatSessionId)
                navigate(`/projects/${session.projectId}`)
              }}
            />
          </div>
        </div>
      )}
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
        <div ref={content} className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8">
          {messages?.length === 0 && (
            <p className="py-16 text-center text-zinc-500 dark:text-zinc-400">
              Describe the system you want to model and GraphiteAI will draw the UML.
            </p>
          )}
          {messages?.map((message) => (
            <ChatMessage key={message.id} message={message} projectId={session?.projectId} />
          ))}

          {progress && (progress.steps.length > 0 || progress.draft) && <LiveReply progress={progress} />}
          {working && (
            <div role="status" className="flex items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
              <Avatar who="agent" />
              <span className="animate-pulse">GraphiteAI is {activity(progress)}…</span>
            </div>
          )}
          {!working && (error != null || unanswered) && (
            <div
              role={error != null ? 'alert' : undefined}
              className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
            >
              <span>
                {error instanceof NoProviderError
                  ? error.message
                  : error != null
                    ? `GraphiteAI couldn't reply: ${error instanceof Error ? error.message : String(error)}`
                    : "GraphiteAI hasn't replied to this message."}
              </span>
              {provider && (
                <button
                  type="button"
                  onClick={() => void run(() => reply(chatSessionId))}
                  className="shrink-0 rounded-lg border border-red-300 px-3 py-1 font-medium hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-900"
                >
                  Retry
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <form
        onSubmit={send}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          void attach([...event.dataTransfer.files])
        }}
        className="mx-auto w-full max-w-3xl px-6 pb-6"
      >
        <div className="mb-2 flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
          {providers?.length === 0 ? (
            <span>
              No model configured.{' '}
              <Link to="/settings" className="font-medium text-zinc-900 underline dark:text-zinc-100">
                Add a provider
              </Link>{' '}
              so GraphiteAI can reply.
            </span>
          ) : (
            <select
              aria-label="Model"
              value={provider?.id ?? ''}
              onChange={(e) => void db.chatSessions.update(chatSessionId, { providerId: Number(e.target.value) })}
              className="rounded-md border border-transparent bg-transparent py-0.5 pr-1 hover:border-zinc-300 focus:border-zinc-400 focus:outline-none dark:hover:border-zinc-700"
            >
              {providers?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {String(p.args.model ?? '')}
                </option>
              ))}
            </select>
          )}
        </div>

        <ContextChips
          parts={context}
          diagrams={diagrams ?? []}
          onRemove={(index) => setContext((parts) => parts.filter((_, i) => i !== index))}
        />
        {attachErrors.length > 0 && (
          <div role="alert" className="mb-2 text-sm text-red-700 dark:text-red-300">
            {attachErrors.map((message) => (
              <p key={message}>{message}</p>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          <AddContext diagrams={diagrams ?? []} onFiles={(files) => void attach(files)} onDiagram={referenceDiagram} />
          <textarea
            aria-label="Message"
            rows={1}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={sendOnEnter}
            onPaste={(event) => {
              const files = [...event.clipboardData.files]
              if (files.length === 0) return
              event.preventDefault()
              void attach(files)
            }}
            placeholder="Message GraphiteAI…"
            className="field-sizing-content max-h-48 min-h-11 flex-1 resize-none rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-500 focus:ring-2 focus:ring-zinc-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          {working ? (
            <button
              type="button"
              aria-label="Stop"
              onClick={() => stopReply(chatSessionId)}
              className="grid size-11 shrink-0 place-items-center rounded-xl bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              <svg viewBox="0 0 20 20" className="size-4" fill="currentColor" aria-hidden="true">
                <rect x="4" y="4" width="12" height="12" rx="2" />
              </svg>
            </button>
          ) : (
            <button
              type="submit"
              aria-label="Send"
              disabled={(!text.trim() && context.length === 0) || !provider}
              className="grid size-11 shrink-0 place-items-center rounded-xl bg-zinc-900 text-white hover:bg-zinc-700 disabled:opacity-30 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              <svg
                viewBox="0 0 20 20"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M4 10h12M11 5l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
      </form>
    </div>
  )
}

/** What the status line says the agent is doing. */
function activity(progress: AgentProgress | undefined): string {
  if (progress?.draft) return 'writing'
  const last = progress?.steps.at(-1)
  if (!last || last.kind === 'thinking') return 'thinking'
  return 'working'
}

const bubble = {
  user: 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900',
  agent: 'border border-zinc-200 bg-zinc-50 text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100',
}

function ChatMessage({ message, projectId }: { message: MessageRecord; projectId?: number }) {
  const who = message.sender === 'user' ? 'user' : 'agent'
  return (
    <motion.article
      data-sender={who}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      title={message.on.toLocaleString()}
      className={`flex items-start gap-3 ${who === 'user' ? 'flex-row-reverse' : ''}`}
    >
      <Avatar who={who} />
      <div className={`flex max-w-[80%] min-w-0 flex-col gap-2 rounded-2xl px-4 py-2.5 leading-relaxed ${bubble[who]}`}>
        {message.steps && <AgentWork steps={message.steps} />}
        {message.parts.map((part, i) => (
          <Part key={i} part={part} projectId={projectId} who={who} />
        ))}
        {message.stopped && (
          <p className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            <svg viewBox="0 0 20 20" className="size-3" fill="currentColor" aria-hidden="true">
              <rect x="4" y="4" width="12" height="12" rx="2" />
            </svg>
            Stopped
          </p>
        )}
      </div>
    </motion.article>
  )
}

/** The reply being written: the agent's work so far and the answer streaming in. */
function LiveReply({ progress }: { progress: AgentProgress }) {
  return (
    <article data-sender="agent" aria-busy="true" className="flex items-start gap-3">
      <Avatar who="agent" />
      <div className={`flex max-w-[80%] min-w-0 flex-col gap-2 rounded-2xl px-4 py-2.5 leading-relaxed ${bubble.agent}`}>
        <AgentWork steps={progress.steps} live />
        {parseReply(progress.draft).map((segment, i) =>
          segment.kind === 'diagram' ? (
            // Diagrams are drawn once the reply is done and they've passed the Mermaid check.
            <div
              key={i}
              className="flex items-baseline justify-between gap-3 rounded-xl border border-dashed border-zinc-300 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-950"
            >
              <span className="truncate font-medium">{segment.name}</span>
              <span className="shrink-0 animate-pulse text-xs text-zinc-500">
                {diagramTypeLabel(segment.type)} · Drawing…
              </span>
            </div>
          ) : (
            <RenderedHtml
              key={i}
              of={new MessagePart(segment.kind, segment.content)}
              className={segment.kind === 'text' ? markdownStyles : undefined}
            />
          ),
        )}
      </div>
    </article>
  )
}

function Part({ part, projectId, who }: { part: MessagePartRecord; projectId?: number; who: 'user' | 'agent' }) {
  if (part.type === 'attachment') return <SentAttachment part={part} />
  if (part.type === 'diagram-reference') {
    return who === 'user' ? (
      <UserDiagramReference diagramId={part.diagramId} projectId={projectId} />
    ) : (
      <DiagramCard diagramId={part.diagramId} projectId={projectId} />
    )
  }
  return <RenderedHtml of={new MessagePart(part.type, part.content)} className={markdownStyles} />
}

/** A diagram the user referenced: a compact link rather than a preview. */
function UserDiagramReference({ diagramId, projectId }: { diagramId: number; projectId?: number }) {
  const diagram = useLiveQuery(async () => (await db.diagrams.get(diagramId)) ?? null, [diagramId])
  if (diagram === undefined) return null
  if (diagram === null) return <p className="text-sm italic opacity-70">Diagram deleted</p>
  return <SentDiagramReference name={diagram.name} href={`/projects/${projectId}/diagrams/${diagramId}`} />
}

function DiagramCard({ diagramId, projectId }: { diagramId: number; projectId?: number }) {
  const diagram = useLiveQuery(async () => (await db.diagrams.get(diagramId)) ?? null, [diagramId])
  if (diagram === undefined) return null
  if (diagram === null) return <p className="text-sm italic text-zinc-500">Diagram deleted</p>
  return (
    <Link
      to={`/projects/${projectId}/diagrams/${diagramId}`}
      className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-3 text-zinc-900 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:border-zinc-500"
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className="truncate font-medium">{diagram.name}</span>
        <span className="shrink-0 text-xs text-zinc-500">{diagramTypeLabel(diagram.type)} · Open</span>
      </span>
      <DiagramPreview source={diagram.source} />
    </Link>
  )
}

function DiagramPreview({ source }: { source: string }) {
  const result = useMermaid(source)
  return <MermaidSvg result={result} source={source} className="max-h-80 overflow-hidden [&_svg]:max-h-80" />
}
