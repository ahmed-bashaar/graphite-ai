import { describe, expect, it, vi } from 'vitest'
import { EventEmitter } from './EventEmitter.ts'

type Events = { ping: number; pong: string }

class TestEmitter extends EventEmitter<Events> {
  fire<K extends keyof Events>(eventName: K, data: Events[K]) {
    this.emit(eventName, data)
  }
}

describe('EventEmitter', () => {
  it('calls only the handlers subscribed to the emitted event', () => {
    const emitter = new TestEmitter()
    const ping = vi.fn()
    const pong = vi.fn()
    emitter.on('ping', ping)
    emitter.on('pong', pong)

    emitter.fire('ping', 42)

    expect(ping).toHaveBeenCalledExactlyOnceWith(42)
    expect(pong).not.toHaveBeenCalled()
  })

  it('stops calling a handler after off() or the returned unsubscribe', () => {
    const emitter = new TestEmitter()
    const a = vi.fn()
    const b = vi.fn()
    emitter.on('ping', a)
    const unsubscribeB = emitter.on('ping', b)

    emitter.off('ping', a)
    unsubscribeB()
    emitter.fire('ping', 1)

    expect(a).not.toHaveBeenCalled()
    expect(b).not.toHaveBeenCalled()
  })

  it('lets a handler unsubscribe itself while the event is being emitted', () => {
    const emitter = new TestEmitter()
    const later = vi.fn()
    const unsubscribe = emitter.on('ping', () => unsubscribe())
    emitter.on('ping', later)

    emitter.fire('ping', 1)
    emitter.fire('ping', 2)

    expect(later).toHaveBeenCalledTimes(2)
  })
})
