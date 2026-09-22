import { describe, expect, it } from 'vitest'
import { HttpError, readLines, readServerSentEvents, request } from './http.ts'

/** A response whose body arrives in the given chunks. */
function chunked(...chunks: string[]) {
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
        controller.close()
      },
    }),
  )
}

async function collect<T>(items: AsyncIterable<T>): Promise<T[]> {
  const all: T[] = []
  for await (const item of items) all.push(item)
  return all
}

describe('readLines', () => {
  it('yields complete lines, even when they are split across chunks', async () => {
    const lines = await collect(readLines(chunked('{"a":', '1}\n{"b"', ':2}\n\n{"c":3}')))
    expect(lines).toEqual(['{"a":1}', '{"b":2}', '{"c":3}'])
  })
})

describe('readServerSentEvents', () => {
  it('yields the data of each event and stops at [DONE]', async () => {
    const events = await collect(
      readServerSentEvents(chunked(': keep-alive\n\ndata: {"x":1}\n', '\ndata: {"x":2}\r\n\r\ndata: [DONE]\n\ndata: {"x":3}\n\n')),
    )
    expect(events).toEqual(['{"x":1}', '{"x":2}'])
  })
})

describe('request', () => {
  const failing = (body: unknown) => async () => new Response(JSON.stringify(body), { status: 404, statusText: 'Not Found' })

  it.each([
    ['Ollama', { error: 'model not found' }, 'model not found'],
    ['OpenAI', { error: { message: 'No such model' } }, 'No such model'],
    ['Gemini', [{ error: { code: 404, message: 'Model retired' } }], 'Model retired'],
  ])('reports %s-style errors with the server message', async (_style, body, message) => {
    await expect(request(failing(body), 'http://x.test')).rejects.toThrow(`404 Not Found: ${message}`)
  })
})

describe('HttpError', () => {
  it('carries the response status', async () => {
    const failing = async () => new Response(JSON.stringify({ error: 'nope' }), { status: 400, statusText: 'Bad Request' })
    const error = await request(failing, 'http://x.test').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(HttpError)
    expect(error).toMatchObject({ status: 400, message: '400 Bad Request: nope' })
  })
})
