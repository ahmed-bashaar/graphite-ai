import { useLiveQuery } from 'dexie-react-hooks'
import { motion } from 'motion/react'
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link, useParams } from 'react-router'
import { Avatar } from '../components/Avatar.tsx'
import { RenderedHtml } from '../components/RenderedHtml.tsx'
import { db, type MessagePartRecord, type MessageRecord } from '../db.ts'
import { MessagePart } from '../lib/index.ts'
import { NEW_CHAT_TITLE, titleFrom } from './chat.ts'
import { NotFound } from './NotFound.tsx'

export function ChatPage() {
  const chatSessionId = Number(useParams().chatId)
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
  const [text, setText] = useState('')
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages?.length])

  async function send(event?: FormEvent) {
    event?.preventDefault()
    const content = text.trim()
    if (!content) return
    setText('')
    await db.transaction('rw', db.messages, db.chatSessions, async () => {
      await db.messages.add({
        chatSessionId,
        sender: 'user',
        on: new Date(),
        isSent: true,
        parts: [{ type: 'text', content }],
      })
      if (session?.title === NEW_CHAT_TITLE) {
        await db.chatSessions.update(chatSessionId, { title: titleFrom(content) })
      }
    })
  }

  // Enter sends; Shift+Enter inserts a newline.
  function sendOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void send()
    }
  }

  if (session === null) return <NotFound what="Chat" />

  return (
    <div className="flex h-full flex-col">
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8">
          {messages?.length === 0 && (
            <p className="py-16 text-center text-zinc-500 dark:text-zinc-400">
              Describe the system you want to model and GraphiteAI will draw the UML.
            </p>
          )}
          {messages?.map((message) => <ChatMessage key={message.id} message={message} />)}
        </div>
      </div>

      <form onSubmit={send} className="mx-auto flex w-full max-w-3xl items-end gap-2 px-6 pb-6">
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
          disabled={!text.trim()}
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
      </form>
    </div>
  )
}

function ChatMessage({ message }: { message: MessageRecord }) {
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
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 leading-relaxed [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-zinc-950 [&_pre]:p-3 [&_pre]:text-sm [&_pre]:text-zinc-100 ${
          who === 'user'
            ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
            : 'border border-zinc-200 bg-zinc-50 text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100'
        }`}
      >
        {message.parts.map((part, i) => (
          <Part key={i} part={part} />
        ))}
      </div>
    </motion.article>
  )
}

function Part({ part }: { part: MessagePartRecord }) {
  if (part.type === 'diagram-reference') {
    return (
      <Link to={`../../diagrams/${part.diagramId}`} relative="path" className="underline">
        Open diagram
      </Link>
    )
  }
  return <RenderedHtml of={new MessagePart(part.type, part.content)} />
}
