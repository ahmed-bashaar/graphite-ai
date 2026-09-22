/** `base` + `path` without doubled slashes. */
export function joinUrl(base: string, path: string): string {
  return base.replace(/\/+$/, '') + path
}

/** A non-2xx response. The message has the status and the server's error message. */
export class HttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

/** Fetches `url`; non-2xx responses throw an HttpError. */
export async function request(fetch: typeof globalThis.fetch, url: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(url, init)
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null)
    throw new HttpError(response.status, `${response.status} ${response.statusText}`.trim() + `: ${errorMessage(body)}`)
  }
  return response
}

/** Fetches JSON, throwing like `request` on errors. */
export async function requestJson<T>(fetch: typeof globalThis.fetch, url: string, init: RequestInit = {}): Promise<T> {
  const response = await request(fetch, url, init)
  return (await response.json().catch(() => null)) as T
}

/** The non-empty lines of a streamed body, as they arrive (e.g. NDJSON). */
export async function* readLines(response: Response): AsyncGenerator<string> {
  if (!response.body) {
    yield* splitLines(await response.text())
    return
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += value
      const end = buffer.lastIndexOf('\n')
      if (end === -1) continue
      yield* splitLines(buffer.slice(0, end))
      buffer = buffer.slice(end + 1)
    }
  } finally {
    reader.releaseLock()
  }
  yield* splitLines(buffer)
}

/** The `data` of each server-sent event, up to an OpenAI-style `[DONE]`. */
export async function* readServerSentEvents(response: Response): AsyncGenerator<string> {
  // Chat-completion events are single-line JSON, so each data line is one event.
  for await (const line of readLines(response)) {
    if (!line.startsWith('data:')) continue
    const event = line.slice(5).trim()
    if (event === '[DONE]') return
    yield event
  }
}

function splitLines(text: string): string[] {
  return text.split(/\r?\n/).filter((line) => line.trim() !== '')
}

// Ollama sends { error: "..." }; OpenAI-style APIs send { error: { message: "..." } };
// Gemini's OpenAI-compatible endpoint wraps that in an array.
function errorMessage(body: unknown): string {
  const error = ((Array.isArray(body) ? body[0] : body) as { error?: unknown } | null)?.error
  if (typeof error === 'string') return error
  const message = (error as { message?: unknown } | undefined)?.message
  return typeof message === 'string' ? message : 'request failed'
}
