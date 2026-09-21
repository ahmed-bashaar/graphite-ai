import { useLiveQuery } from 'dexie-react-hooks'
import { motion } from 'motion/react'
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link, useParams } from 'react-router'
import { NoProviderError, reply, sendMessage } from '../agent/conversation.ts'
import { Avatar } from '../components/Avatar.tsx'
import { RenderedHtml } from '../components/RenderedHtml.tsx'
import { db, type MessagePartRecord, type MessageRecord } from '../db.ts'
import { MessagePart } from '../lib/index.ts'
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

  const [text, setText] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages?.length, pending])

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
    if (!content || pending || !provider) return
    setText('')
    void run(() => sendMessage(chatSessionId, content))
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
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8">
          {messages?.length === 0 && (
            <p className="py-16 text-center text-zinc-500 dark:text-zinc-400">
              Describe the system you want to model and GraphiteAI will draw the UML.
            </p>
          )}
          {messages?.map((message) => (
            <ChatMessage key={message.id} message={message} projectId={session?.projectId} />
          ))}

          {pending && (
            <div role="status" className="flex items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
              <Avatar who="agent" />
              <span className="animate-pulse">GraphiteAI is thinking…</span>
            </div>
          )}
          {!pending && (error != null || unanswered) && (
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

      <form onSubmit={send} className="mx-auto w-full max-w-3xl px-6 pb-6">
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

        <div className="flex items-end gap-2">
          <textarea
            aria-label="Message"
            rows={1}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={sendOnEnter}
            placeholder="Message GraphiteAI…"
            className="field-sizing-content max-h-48 min-h-11 flex-1 resize-none rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-500 focus:ring-2 focus:ring-zinc-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={!text.trim() || pending || !provider}
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
        </div>
      </form>
    </div>
  )
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
      <div
        className={`flex max-w-[80%] min-w-0 flex-col gap-2 rounded-2xl px-4 py-2.5 leading-relaxed [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-zinc-950 [&_pre]:p-3 [&_pre]:text-sm [&_pre]:text-zinc-100 ${
          who === 'user'
            ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
            : 'border border-zinc-200 bg-zinc-50 text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100'
        }`}
      >
        {message.parts.map((part, i) => (
          <Part key={i} part={part} projectId={projectId} />
        ))}
      </div>
    </motion.article>
  )
}

function Part({ part, projectId }: { part: MessagePartRecord; projectId?: number }) {
  if (part.type === 'diagram-reference') return <DiagramCard diagramId={part.diagramId} projectId={projectId} />
  return <RenderedHtml of={new MessagePart(part.type, part.content)} />
}

function DiagramCard({ diagramId, projectId }: { diagramId: number; projectId?: number }) {
  const diagram = useLiveQuery(async () => (await db.diagrams.get(diagramId)) ?? null, [diagramId])
  if (diagram === undefined) return null
  if (diagram === null) return <p className="text-sm italic text-zinc-500">Diagram deleted</p>
  return (
    <Link
      to={`/projects/${projectId}/diagrams/${diagramId}`}
      className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:border-zinc-500"
    >
      <svg viewBox="0 0 20 20" className="size-5 shrink-0 text-zinc-500" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <rect x="2.5" y="3" width="6" height="5" rx="1" />
        <rect x="11.5" y="12" width="6" height="5" rx="1" />
        <path d="M5.5 8v6.5h6" />
      </svg>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{diagram.name}</span>
        <span className="block text-xs text-zinc-500">{diagram.type} diagram · Open</span>
      </span>
    </Link>
  )
}
