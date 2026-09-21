/** `base` + `path` without doubled slashes. */
export function joinUrl(base: string, path: string): string {
  return base.replace(/\/+$/, '') + path
}

/** Fetches JSON; non-2xx responses throw with the status and the server's error message. */
export async function requestJson<T>(fetch: typeof globalThis.fetch, url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, init)
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`.trim() + `: ${errorMessage(body)}`)
  }
  return body as T
}

// Ollama sends { error: "..." }; OpenAI-style APIs send { error: { message: "..." } }.
function errorMessage(body: unknown): string {
  const error = (body as { error?: unknown } | null)?.error
  if (typeof error === 'string') return error
  const message = (error as { message?: unknown } | undefined)?.message
  return typeof message === 'string' ? message : 'request failed'
}
