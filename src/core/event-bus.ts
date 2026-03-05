import { EventEmitter } from 'node:events';
import type { ClorcEvent, ClorcEventType, EventPayload } from '../types/index.js';

export class EventBus extends EventEmitter {
  private static instance: EventBus | null = null;
  private history: ClorcEvent[] = [];

  private constructor() {
    super();
    this.setMaxListeners(20);
  }

  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  static resetInstance(): void {
    if (EventBus.instance) {
      EventBus.instance.removeAllListeners();
      EventBus.instance.history = [];
      EventBus.instance = null;
    }
  }

  emitEvent<T extends ClorcEventType>(type: T, payload: EventPayload<T>): void {
    const event = { type, payload } as ClorcEvent;
    this.history.push(event);
    this.emit(type, payload);
    this.emit('*', event);
  }

  onEvent<T extends ClorcEventType>(type: T, listener: (payload: EventPayload<T>) => void): this {
    return this.on(type, listener);
  }

  onAny(listener: (event: ClorcEvent) => void): this {
    return this.on('*', listener);
  }

  getHistory(): ClorcEvent[] {
    return [...this.history];
  }

  clearHistory(): void {
    this.history = [];
  }
}
