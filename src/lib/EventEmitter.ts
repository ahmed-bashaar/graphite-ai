export type EventMap = Record<string, unknown>

export type EventHandler<T> = (data: T) => void

export class EventEmitter<Events extends EventMap> {
  private listeners = new Map<keyof Events, Set<EventHandler<never>>>()

  protected emit<K extends keyof Events>(eventName: K, data: Events[K]): void {
    const handlers = this.listeners.get(eventName)
    if (!handlers) return
    // Copy so handlers can unsubscribe while being called.
    for (const handler of [...handlers]) {
      ;(handler as EventHandler<Events[K]>)(data)
    }
  }

  /** Subscribes `handler` to `eventName`, returning a function that unsubscribes it. */
  on<K extends keyof Events>(eventName: K, handler: EventHandler<Events[K]>): () => void {
    let handlers = this.listeners.get(eventName)
    if (!handlers) {
      handlers = new Set()
      this.listeners.set(eventName, handlers)
    }
    handlers.add(handler)
    return () => this.off(eventName, handler)
  }

  off<K extends keyof Events>(eventName: K, handler: EventHandler<Events[K]>): void {
    const handlers = this.listeners.get(eventName)
    if (!handlers) return
    handlers.delete(handler)
    if (handlers.size === 0) this.listeners.delete(eventName)
  }
}
