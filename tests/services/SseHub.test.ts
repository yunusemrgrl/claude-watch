import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SseHub } from '../../src/services/SseHub.js';

describe('SseHub', () => {
  let hub: SseHub;

  beforeEach(() => {
    hub = new SseHub();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with zero clients', () => {
    expect(hub.clientCount).toBe(0);
  });

  it('increments clientCount on addClient', () => {
    const send = vi.fn();
    const ping = vi.fn();
    hub.addClient(send, ping, () => {});
    expect(hub.clientCount).toBe(1);
  });

  it('decrements clientCount when cleanup is called', () => {
    const send = vi.fn();
    const ping = vi.fn();
    let storedCleanup = () => {};
    hub.addClient(send, ping, (handler) => { storedCleanup = handler; });
    expect(hub.clientCount).toBe(1);
    storedCleanup();
    expect(hub.clientCount).toBe(0);
  });

  it('broadcasts to all connected clients', () => {
    const send1 = vi.fn();
    const send2 = vi.fn();
    hub.addClient(send1, vi.fn(), () => {});
    hub.addClient(send2, vi.fn(), () => {});

    hub.broadcast({ type: 'test' });

    expect(send1).toHaveBeenCalledWith({ type: 'test' });
    expect(send2).toHaveBeenCalledWith({ type: 'test' });
  });

  it('does not broadcast to disconnected clients', () => {
    const send = vi.fn();
    let storedCleanup = () => {};
    hub.addClient(send, vi.fn(), (handler) => { storedCleanup = handler; });

    storedCleanup(); // disconnect
    hub.broadcast({ type: 'test' });

    expect(send).not.toHaveBeenCalled();
  });

  it('calls ping every 30 seconds', () => {
    const ping = vi.fn();
    hub.addClient(vi.fn(), ping, () => {});

    vi.advanceTimersByTime(30_000);
    expect(ping).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(30_000);
    expect(ping).toHaveBeenCalledTimes(2);
  });

  it('stops pinging after client disconnects', () => {
    const ping = vi.fn();
    let storedCleanup = () => {};
    hub.addClient(vi.fn(), ping, (handler) => { storedCleanup = handler; });

    storedCleanup(); // disconnect
    vi.advanceTimersByTime(60_000);

    expect(ping).not.toHaveBeenCalled();
  });

  it('addClient returns cleanup function', () => {
    const cleanup = hub.addClient(vi.fn(), vi.fn(), () => {});
    expect(typeof cleanup).toBe('function');
    expect(hub.clientCount).toBe(1);
    cleanup();
    expect(hub.clientCount).toBe(0);
  });
});
