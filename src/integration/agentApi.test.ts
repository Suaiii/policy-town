import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SandboxEventInput } from '../../packages/events/src';
import { appendSandboxEvent } from './agentApi';

const validEvent: SandboxEventInput = {
  type: 'invest',
  actor: 'gov',
  target: 'enterprise-a',
  at: '2008 · Q3',
  visibility: 'public',
  reveal_at: null,
  payload: { amount: 42 },
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('appendSandboxEvent', () => {
  it('posts a sandbox event and dispatches a relationship refresh notification', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const windowMock = new EventTarget();
    const received = vi.fn();
    windowMock.addEventListener('relationship-network:updated', received);
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', windowMock);

    await expect(appendSandboxEvent(validEvent)).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:5274/api/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validEvent),
      signal: expect.any(AbortSignal),
    });
    expect(received).toHaveBeenCalledOnce();
    expect(received.mock.calls[0][0]).toBeInstanceOf(CustomEvent);
    expect(received.mock.calls[0][0].type).toBe('relationship-network:updated');
  });

  it('returns false without notifying when the bridge rejects the event', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
    const windowMock = new EventTarget();
    const received = vi.fn();
    windowMock.addEventListener('relationship-network:updated', received);
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', windowMock);

    await expect(appendSandboxEvent(validEvent)).resolves.toBe(false);

    expect(received).not.toHaveBeenCalled();
  });

  it('returns false without notifying when the action request rejects', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network unavailable'));
    const windowMock = new EventTarget();
    const received = vi.fn();
    windowMock.addEventListener('relationship-network:updated', received);
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', windowMock);

    await expect(appendSandboxEvent(validEvent)).resolves.toBe(false);

    expect(received).not.toHaveBeenCalled();
  });

  it('returns false without notifying when the action request times out', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new DOMException('The operation timed out', 'TimeoutError'));
    const windowMock = new EventTarget();
    const received = vi.fn();
    windowMock.addEventListener('relationship-network:updated', received);
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', windowMock);

    await expect(appendSandboxEvent(validEvent)).resolves.toBe(false);

    expect(received).not.toHaveBeenCalled();
  });

  it('returns true after persistence succeeds without a window global', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', undefined);

    await expect(appendSandboxEvent(validEvent)).resolves.toBe(true);
  });

  it('returns true after persistence succeeds when notification dispatch is unavailable', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', {});

    await expect(appendSandboxEvent(validEvent)).resolves.toBe(true);
  });

  it('returns true after persistence succeeds when notification dispatch throws', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const dispatchEvent = vi.fn(() => {
      throw new Error('notification unavailable');
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', { dispatchEvent });

    await expect(appendSandboxEvent(validEvent)).resolves.toBe(true);
    expect(dispatchEvent).toHaveBeenCalledOnce();
  });
});
