import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '../src/core/event-bus.js';

describe('EventBus', () => {
  beforeEach(() => {
    EventBus.resetInstance();
  });

  it('returns singleton instance', () => {
    const a = EventBus.getInstance();
    const b = EventBus.getInstance();
    expect(a).toBe(b);
  });

  it('emits and receives typed events', () => {
    const bus = EventBus.getInstance();
    let received: any = null;

    bus.onEvent('mission:start', (payload) => {
      received = payload;
    });

    bus.emitEvent('mission:start', { mission: 'test', timestamp: '2026-01-01' });
    expect(received).toEqual({ mission: 'test', timestamp: '2026-01-01' });
  });

  it('stores event history', () => {
    const bus = EventBus.getInstance();
    bus.emitEvent('mission:start', { mission: 'test', timestamp: '2026-01-01' });
    bus.emitEvent('plan:created', { milestones: [], taskCount: 0 });

    const history = bus.getHistory();
    expect(history).toHaveLength(2);
    expect(history[0].type).toBe('mission:start');
    expect(history[1].type).toBe('plan:created');
  });

  it('onAny receives all events', () => {
    const bus = EventBus.getInstance();
    const events: any[] = [];

    bus.onAny((event) => events.push(event));

    bus.emitEvent('mission:start', { mission: 'test', timestamp: '2026-01-01' });
    bus.emitEvent('plan:created', { milestones: [], taskCount: 5 });

    expect(events).toHaveLength(2);
  });

  it('clearHistory clears stored events', () => {
    const bus = EventBus.getInstance();
    bus.emitEvent('mission:start', { mission: 'test', timestamp: '2026-01-01' });
    bus.clearHistory();
    expect(bus.getHistory()).toHaveLength(0);
  });

  it('resetInstance creates new instance', () => {
    const a = EventBus.getInstance();
    EventBus.resetInstance();
    const b = EventBus.getInstance();
    expect(a).not.toBe(b);
  });
});
