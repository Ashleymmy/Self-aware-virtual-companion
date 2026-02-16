import type { Live2DSignal } from "./live2d-bridge.js";

export type Live2DChannelSource = "interaction" | "voice" | "text" | "system";
export type Live2DChannelBackend = "gateway" | "mock";

export interface Live2DChannelEvent {
  id: string;
  at: number;
  source: Live2DChannelSource;
  backend: Live2DChannelBackend;
  ok: boolean;
  note: string;
  signal: Live2DSignal;
}

export interface Live2DChannelSnapshot {
  active: Live2DChannelEvent | null;
  events: Live2DChannelEvent[];
}

interface PublishParams {
  source: Live2DChannelSource;
  backend: Live2DChannelBackend;
  ok: boolean;
  note: string;
  signal: Live2DSignal;
}

const MAX_EVENTS = 30;

let _active: Live2DChannelEvent | null = null;
let _events: Live2DChannelEvent[] = [];
const _listeners = new Set<(snapshot: Live2DChannelSnapshot) => void>();

function notifyAll() {
  const snapshot = getLive2DChannelSnapshot();
  _listeners.forEach((listener) => listener(snapshot));
}

export function getLive2DChannelSnapshot(): Live2DChannelSnapshot {
  return {
    active: _active,
    events: [..._events],
  };
}

export function subscribeLive2DChannel(
  listener: (snapshot: Live2DChannelSnapshot) => void,
): () => void {
  _listeners.add(listener);
  listener(getLive2DChannelSnapshot());
  return () => {
    _listeners.delete(listener);
  };
}

export function publishLive2DSignal(params: PublishParams): Live2DChannelEvent {
  const event: Live2DChannelEvent = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: Date.now(),
    source: params.source,
    backend: params.backend,
    ok: params.ok,
    note: params.note,
    signal: params.signal,
  };
  _active = event;
  _events = [event, ..._events].slice(0, MAX_EVENTS);
  notifyAll();
  return event;
}
