import { motion } from 'motion/react'
import { type ReactNode, type RefObject, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Logo } from '../components/Logo.tsx'
import { Reveal } from '../components/Reveal.tsx'
import { StreamedText, TypedText } from '../components/textEffects.tsx'
import { useCountUp } from '../components/useCountUp.ts'
import { useInViewOnce } from '../components/useInViewOnce.ts'
import { usePrefersReducedMotion } from '../components/usePrefersReducedMotion.ts'

/**
 * The opening sequence, in order. Each step starts when the one before it
 * finishes; the example chat also waits until it is on screen.
 */
const step = {
  typeHeadline: 0,
  streamHeadline: 1,
  subheadline: 2,
  popIn: 3,
  exampleIn: 4, // the chat appears and the user types
  agentWorks: 5,
  agentStreams: 6,
  answered: 7, // a beat before the diagram appears
  diagram: 8, // the card, then the classes and links one by one
  done: 9,
} as const

/** `/`: what GraphiteAI is, with the way into the app (`/app`). */
export function LandingPage() {
  const instant = usePrefersReducedMotion()
  const [current, setCurrent] = useState<number>(step.typeHeadline)
  const at = instant ? step.done : current
  /** Moves on from step `from`, once. */
  const advance = (from: number) => () => setCurrent((now) => (now === from ? from + 1 : now))

  const exampleRef = useRef<HTMLElement>(null)
  const exampleInView = useInViewOnce(exampleRef, 0.3)
  useCountUp(1, { active: at === step.subheadline, stepMs: 700, onDone: advance(step.subheadline) })
  useCountUp(1, { active: at === step.popIn && exampleInView, stepMs: 450, onDone: advance(step.popIn) })

  return (
    <div className="flex min-h-svh flex-col bg-zinc-50 bg-[radial-gradient(var(--color-zinc-300)_1px,transparent_1px)] bg-size-[24px_24px] text-zinc-900 dark:bg-zinc-950 dark:bg-[radial-gradient(var(--color-zinc-800)_1px,transparent_1px)] dark:text-zinc-50">
      <header className="flex h-15 items-center justify-between px-4 sm:h-18 sm:px-12">
        <span className="flex items-center gap-2.5 font-semibold tracking-tight">
          <Logo className="size-7 sm:size-8" />
          GraphiteAI
        </span>
        <Link
          to="/app"
          className="px-1 py-3 text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          Open the app <span aria-hidden="true">→</span>
        </Link>
      </header>

      <main className="flex flex-col">
        <section className="flex flex-col items-center gap-5 px-4 pt-12 text-center sm:gap-6 sm:px-12 sm:pt-22">
          <Reveal shown={at >= step.popIn} effect="pop">
            <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white py-1 pr-3 pl-2 text-xs font-medium tracking-wider text-zinc-600 uppercase dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              <span className="size-2 rounded-full bg-zinc-900 dark:bg-zinc-100" />
              An AI agent for UML
            </span>
          </Reveal>
          <h1 className="max-w-225 text-[44px] leading-[46px] font-semibold tracking-[-0.035em] sm:text-7xl sm:leading-[76px]">
            <TypedText
              text="Describe the system."
              active
              instant={instant}
              delay={250}
              charMs={38}
              onDone={advance(step.typeHeadline)}
            />
            <br />
            <span className="text-zinc-500 dark:text-zinc-400">
              <StreamedText
                text="Get the diagram."
                active={at >= step.streamHeadline}
                instant={instant}
                delay={150}
                tokenMs={70}
                onDone={advance(step.streamHeadline)}
              />
            </span>
          </h1>
          <Reveal shown={at >= step.subheadline} duration={1.2}>
            <p className="max-w-150 text-[17px] leading-[26px] text-zinc-600 sm:text-xl sm:leading-[30px] dark:text-zinc-400">
              Tell GraphiteAI how your system works in plain words. It draws the class, sequence and state diagrams
              for you.
            </p>
          </Reveal>
          <Reveal shown={at >= step.popIn} effect="pop" className="mt-1 self-stretch sm:mt-2 sm:self-auto">
            <Link
              to="/app"
              className="flex h-13 items-center justify-center gap-2.5 rounded-xl bg-zinc-900 px-6 font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              Open GraphiteAI
              <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true">
                <path
                  d="M4 10h12M11 5l5 5-5 5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
          </Reveal>
        </section>

        <ChatPreview ref={exampleRef} at={at} instant={instant} advance={advance} />

        <Features instant={instant} />
      </main>

      <footer className="mt-auto flex items-center justify-center px-4 pt-18 pb-7 text-xs text-zinc-500 sm:pt-30 dark:text-zinc-400">
        GraphiteAI · UML diagrams from plain words
      </footer>
    </div>
  )
}

/** The feature cards, which come in one by one when they scroll into view. */
function Features({ instant }: { instant: boolean }) {
  const ref = useRef<HTMLElement>(null)
  const inView = useInViewOnce(ref, 0.1)
  // The heading, then each of the four cards.
  const shown = useCountUp(5, { active: inView, instant, stepMs: 160 })
  return (
    <section
      ref={ref}
      className="mx-4 mt-18 flex flex-col gap-7 sm:mx-auto sm:mt-30 sm:w-full sm:max-w-260 sm:gap-10 sm:px-6 lg:px-0"
    >
      <Reveal shown={shown >= 1} className="flex flex-col items-center gap-2.5 text-center sm:gap-3">
        <span className="text-xs font-medium tracking-wider text-zinc-500 uppercase dark:text-zinc-400">Features</span>
        <h2 className="text-[28px] leading-[34px] font-semibold tracking-[-0.03em] sm:text-[40px] sm:leading-12">
          Built for how you actually design
        </h2>
      </Reveal>
      <div className="grid gap-3 md:grid-cols-2">
        <Feature
          shown={shown >= 2}
          icon={
            <path
              d="M3.5 10a6.5 6.5 0 1 0 2-4.7M3.5 3v3h3M10 6.5V10l2.5 1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          }
          title="Version history"
          text="Every change to a diagram is kept. Look back at any version, see what changed and restore it."
        >
          <ul className="flex flex-col rounded-xl border border-zinc-100 p-1 text-sm dark:border-zinc-800">
            <li className="flex items-center justify-between rounded-lg bg-zinc-100 px-2.5 py-2 sm:px-3 dark:bg-zinc-800">
              v3 · Added Payment
              <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-xs text-white dark:bg-zinc-100 dark:text-zinc-900">
                Current
              </span>
            </li>
            <VersionRow label="v2 · Split LineItem out" when="2 min ago" />
            <VersionRow label="v1 · First draft" when="5 min ago" />
          </ul>
        </Feature>

        <Feature
          shown={shown >= 3}
          icon={
            <>
              <path d="M10 2.5 16 5v4.5c0 3.8-2.6 6.6-6 8-3.4-1.4-6-4.2-6-8V5l6-2.5Z" strokeLinejoin="round" />
              <path d="m7.5 10 1.8 1.8L12.8 8.3" strokeLinecap="round" strokeLinejoin="round" />
            </>
          }
          title="Local-only, in your browser"
          text="GraphiteAI runs entirely in the browser. Your projects, chats and diagrams stay on your device."
        >
          <div className="flex flex-col items-stretch gap-2 rounded-xl border border-zinc-100 p-3 sm:flex-row sm:items-center sm:gap-3 sm:p-4 dark:border-zinc-800">
            <div className="flex flex-1 flex-col items-center gap-1 rounded-[10px] border border-dashed border-zinc-300 bg-zinc-50 p-3 whitespace-nowrap dark:border-zinc-700 dark:bg-zinc-950">
              <span className="text-sm font-medium">Your browser</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">Projects · Chats · Diagrams</span>
            </div>
            <Arrow viewBox="0 0 12 28" d="M6 2v24M1 20l5 6 5-6" className="h-7 w-3 self-center sm:hidden" />
            <Arrow viewBox="0 0 40 12" d="M2 6h36M32 1l6 5-6 5" className="hidden h-3 w-10 sm:block" />
            <div className="flex flex-1 flex-col items-center gap-1 rounded-[10px] border border-zinc-200 p-3 whitespace-nowrap dark:border-zinc-800">
              <span className="text-sm font-medium">Your provider</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">Model calls</span>
            </div>
          </div>
        </Feature>

        <Feature
          shown={shown >= 4}
          icon={
            <>
              <rect x="3" y="3" width="5.5" height="5.5" rx="1.5" />
              <rect x="11.5" y="3" width="5.5" height="5.5" rx="1.5" />
              <rect x="3" y="11.5" width="5.5" height="5.5" rx="1.5" />
              <rect x="11.5" y="11.5" width="5.5" height="5.5" rx="1.5" />
            </>
          }
          title="Your models, your providers"
          text="Connect the provider you already use and pick any of its models. Switch whenever you like."
        >
          <ul className="flex flex-wrap gap-1.5 text-sm font-medium">
            {['Anthropic', 'OpenAI', 'Gemini', 'Grok', 'DeepSeek'].map((provider) => (
              <li
                key={provider}
                className="rounded-full border border-zinc-200 px-2.75 py-1.5 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
              >
                {provider}
              </li>
            ))}
            <li className="rounded-full bg-zinc-100 px-2.75 py-1.5 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
              and more…
            </li>
          </ul>
        </Feature>

        <Feature
          shown={shown >= 5}
          icon={
            <>
              <path d="M15.5 7A6 6 0 0 0 4.3 7.5M4.5 13a6 6 0 0 0 11.2-.5" strokeLinecap="round" />
              <path d="M15.8 3.5V7h-3.5M4.2 16.5V13h3.5" strokeLinecap="round" strokeLinejoin="round" />
            </>
          }
          title="An agent that checks its work"
          text="GraphiteAI works in a loop: it reads your project, drafts a diagram, checks that it renders and fixes it before it replies."
        >
          <ul className="flex flex-col gap-2 rounded-xl border border-zinc-100 px-3.5 py-3 text-sm text-zinc-600 sm:px-4 sm:py-3.5 dark:border-zinc-800 dark:text-zinc-400">
            <CheckedStep>Listed the project’s diagrams</CheckedStep>
            <CheckedStep>Drafted “Order service”</CheckedStep>
            <CheckedStep>Checked the diagram: it renders</CheckedStep>
          </ul>
        </Feature>
      </div>
    </section>
  )
}

const userMessage = 'Customers place orders. Each order has line items and one payment.'
const agentMessage = 'Here is the class diagram for the ordering flow.'

type ChatPreviewProps = {
  ref: RefObject<HTMLElement | null>
  at: number
  instant: boolean
  advance: (from: number) => () => void
}

/**
 * An example chat that plays out: the user types a request, GraphiteAI works
 * on it and streams its answer, then the diagram builds up class by class.
 */
function ChatPreview({ ref, at, instant, advance }: ChatPreviewProps) {
  useCountUp(1, { active: at === step.agentWorks, stepMs: 900, onDone: advance(step.agentWorks) })
  useCountUp(1, { active: at === step.answered, stepMs: 300, onDone: advance(step.answered) })
  const partsShown = useCountUp(diagramPartCount, {
    active: at >= step.diagram,
    delay: 400,
    instant,
    stepMs: 260,
    onDone: advance(step.diagram),
  })
  const working = at < step.agentStreams

  return (
    <Reveal
      shown={at >= step.exampleIn}
      className="mx-4 mt-10 sm:mx-auto sm:mt-18 sm:w-[calc(100%-3rem)] sm:max-w-260"
    >
      <section
        ref={ref}
        aria-label="Example chat"
        className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-4 sm:p-6 lg:flex-row lg:gap-6 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="flex shrink-0 flex-col gap-4 lg:w-85">
          <p className="max-w-70 self-end rounded-2xl bg-zinc-900 px-4 py-3 text-[15px] leading-6 text-white lg:max-w-none dark:bg-zinc-100 dark:text-zinc-900">
            <TypedText
              text={userMessage}
              active={at >= step.exampleIn}
              instant={instant}
              delay={450}
              charMs={18}
              onDone={advance(step.exampleIn)}
            />
          </p>
          <Reveal shown={at >= step.agentWorks} delay={0.3} className="flex items-start gap-2.5 sm:gap-3">
            <Logo className="size-7 shrink-0 sm:size-8" />
            <div className="flex flex-col gap-1.5 rounded-2xl bg-zinc-50 px-3.5 py-3 sm:gap-2 sm:px-4 dark:bg-zinc-800">
              <span
                className={`text-[13px] leading-[18px] text-zinc-500 sm:text-sm dark:text-zinc-400 ${working ? 'animate-pulse' : ''}`}
              >
                {working ? 'Working…' : 'Worked through 3 steps'}
              </span>
              <span className="text-[15px] leading-6">
                <StreamedText
                  text={agentMessage}
                  active={at >= step.agentStreams}
                  instant={instant}
                  delay={150}
                  onDone={advance(step.agentStreams)}
                />
              </span>
            </div>
          </Reveal>
        </div>

        <Reveal
          shown={at >= step.diagram}
          className="flex grow flex-col gap-2.5 rounded-xl border border-zinc-200 px-3 pt-3 pb-3.5 sm:gap-3 sm:px-5 sm:pt-4 sm:pb-5 dark:border-zinc-800"
        >
          <div className="flex items-center justify-between">
            <span className="font-medium sm:text-lg">Order service</span>
            <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
              Class diagram
            </span>
          </div>
          <OrderDiagram layout="wide" shown={partsShown} className="hidden sm:block" />
          <OrderDiagram layout="tall" shown={partsShown} className="sm:hidden" />
        </Reveal>
      </section>
    </Reveal>
  )
}

type Box = { name: string; x: number; y: number; height: number; attributes: string[]; operations: string[] }

/** A line between two classes, its multiplicities and, for a composition, the diamond. */
type Link = { d: string; diamond?: string; labels: (readonly [number, number, string])[] }

type DiagramPart = { box: Box } | { link: Link }

const boxWidth = { wide: 160, tall: 150 }

const customer = { name: 'Customer', attributes: ['+id: UUID', '+name: String'], operations: ['+placeOrder()'] }
const order = { name: 'Order', attributes: ['+id: UUID', '+status: Status', '+total: Money'], operations: ['+checkout()'] }
const lineItem = { name: 'LineItem', attributes: ['+sku: String', '+qty: Int'], operations: ['+subtotal()'] }
const payment = { name: 'Payment', attributes: ['+amount: Money', '+method: String'], operations: [] }

/**
 * The diagram in the order it builds up, in two layouts: side by side on wide
 * screens, two by two on phones. Each link follows the classes it joins.
 */
const diagramLayouts: Record<'wide' | 'tall', { viewBox: string; fontSize: number; parts: DiagramPart[] }> = {
  wide: {
    viewBox: '0 0 590 290',
    fontSize: 13,
    parts: [
      { box: { ...customer, x: 10, y: 20, height: 112 } },
      { box: { ...order, x: 220, y: 20, height: 140 } },
      { link: { d: 'M170 72 H220', labels: [[176, 64, '1'], [204, 64, '*']] } },
      { box: { ...lineItem, x: 420, y: 20, height: 112 } },
      {
        link: { d: 'M380 72 H420', diamond: 'M420 72 l-10 -6 l-10 6 l10 6 z', labels: [[386, 64, '1'], [386, 92, '1..*']] },
      },
      { box: { ...payment, x: 220, y: 200, height: 84 } },
      { link: { d: 'M300 160 V200', labels: [[306, 176, '1'], [306, 194, '1']] } },
    ],
  },
  tall: {
    viewBox: '0 0 358 320',
    fontSize: 12,
    parts: [
      { box: { ...customer, x: 10, y: 10, height: 112 } },
      { box: { ...order, x: 198, y: 10, height: 140 } },
      { link: { d: 'M160 64 H198', labels: [[165, 57, '1'], [189, 57, '*']] } },
      { box: { ...lineItem, x: 198, y: 200, height: 112 } },
      {
        link: { d: 'M306 170 V200', diamond: 'M306 150 l6 10 l-6 10 l-6 -10 z', labels: [[314, 166, '1'], [312, 194, '1..*']] },
      },
      { box: { ...payment, x: 10, y: 200, height: 84 } },
      { link: { d: 'M240 150 V175 H85 V200', labels: [[246, 167, '1'], [91, 194, '1']] } },
    ],
  },
}

const diagramPartCount = diagramLayouts.wide.parts.length

const partMotion = {
  hidden: { opacity: 0, y: 10 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
} as const

/** A hand-drawn class diagram, so the preview needs no Mermaid. The first `shown` parts are visible. */
function OrderDiagram({
  layout,
  shown,
  className,
}: {
  layout: keyof typeof diagramLayouts
  shown: number
  className: string
}) {
  const { viewBox, fontSize, parts } = diagramLayouts[layout]
  const width = boxWidth[layout]
  return (
    <svg
      viewBox={viewBox}
      role="img"
      aria-label="Class diagram: Customer places Orders; Order contains LineItems and has one Payment"
      className={`h-auto w-full ${className}`}
    >
      {parts.map((part, i) => (
        <motion.g
          key={i}
          data-revealed={i < shown}
          variants={partMotion}
          initial={i < shown ? false : 'hidden'}
          animate={i < shown ? 'shown' : 'hidden'}
        >
          {'box' in part ? (
            <ClassBox box={part.box} width={width} fontSize={fontSize} />
          ) : (
            <LinkLine link={part.link} />
          )}
        </motion.g>
      ))}
    </svg>
  )
}

function LinkLine({ link: { d, diamond, labels } }: { link: Link }) {
  return (
    <>
      <path d={d} className="stroke-zinc-500" strokeWidth="1.4" fill="none" />
      {diamond && <path d={diamond} className="fill-zinc-900 dark:fill-zinc-100" />}
      <g fontSize="11" className="fill-zinc-500 dark:fill-zinc-400">
        {labels.map(([x, y, text]) => (
          <text key={`${x},${y}`} x={x} y={y}>
            {text}
          </text>
        ))}
      </g>
    </>
  )
}

function ClassBox({
  box: { name, x, y, height, attributes, operations },
  width,
  fontSize,
}: {
  box: Box
  width: number
  fontSize: number
}) {
  const divider = y + 36 + attributes.length * 20
  return (
    <g fontSize={fontSize} className="fill-zinc-900 dark:fill-zinc-100">
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx="6"
        className="fill-white stroke-zinc-400 dark:fill-zinc-900 dark:stroke-zinc-600"
      />
      <path
        d={`M${x} ${y + 6} a6 6 0 0 1 6 -6 h${width - 12} a6 6 0 0 1 6 6 v18 h-${width} z`}
        className="fill-zinc-100 dark:fill-zinc-800"
      />
      <line x1={x} y1={y + 24} x2={x + width} y2={y + 24} className="stroke-zinc-400 dark:stroke-zinc-600" />
      <text x={x + width / 2} y={y + 17} textAnchor="middle" fontWeight="600">
        {name}
      </text>
      {attributes.map((attribute, i) => (
        <text key={attribute} x={x + 12} y={y + 46 + i * 20}>
          {attribute}
        </text>
      ))}
      {operations.length > 0 && (
        <line x1={x} y1={divider} x2={x + width} y2={divider} className="stroke-zinc-200 dark:stroke-zinc-700" />
      )}
      {operations.map((operation, i) => (
        <text key={operation} x={x + 12} y={divider + 22 + i * 20}>
          {operation}
        </text>
      ))}
    </g>
  )
}

type FeatureProps = { shown: boolean; icon: ReactNode; title: string; text: string; children: ReactNode }

function Feature({ shown, icon, title, text, children }: FeatureProps) {
  return (
    <Reveal shown={shown}>
      <article className="flex h-full flex-col gap-3.5 rounded-2xl border border-zinc-200 bg-white p-5 sm:gap-4 sm:p-7 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="grid size-10 place-items-center rounded-[10px] bg-zinc-100 dark:bg-zinc-800">
          <svg
            viewBox="0 0 20 20"
            className="size-5"
            stroke="currentColor"
            strokeWidth="1.7"
            fill="none"
            aria-hidden="true"
          >
            {icon}
          </svg>
        </div>
        <div className="flex flex-col gap-1.5">
          <h3 className="text-lg leading-[26px] font-semibold sm:leading-7">{title}</h3>
          <p className="text-[15px] leading-6 text-zinc-600 dark:text-zinc-400">{text}</p>
        </div>
        {children}
      </article>
    </Reveal>
  )
}

function VersionRow({ label, when }: { label: string; when: string }) {
  return (
    <li className="flex items-center justify-between px-2.5 py-2 text-zinc-600 sm:px-3 dark:text-zinc-400">
      {label}
      <span className="text-xs text-zinc-500">{when}</span>
    </li>
  )
}

function Arrow({ viewBox, d, className }: { viewBox: string; d: string; className: string }) {
  return (
    <svg viewBox={viewBox} className={`shrink-0 stroke-zinc-400 dark:stroke-zinc-500 ${className}`} aria-hidden="true">
      <path d={d} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CheckedStep({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-center gap-2.5">
      <svg viewBox="0 0 20 20" className="size-4 shrink-0 stroke-zinc-900 dark:stroke-zinc-100" aria-hidden="true">
        <path d="m5 10.5 3 3 7-7" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {children}
    </li>
  )
}
