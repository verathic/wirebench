/**
 * An engine live event as the renderer receives it: tagged with its send, and redacted for the
 * session's show-secrets flag exactly as `EngineService` redacted its own live events.
 */
import type { LiveEvent } from '@wirebench/engine';
import { kindSend } from '../kinds/kind-send.js';
import type { GrpcLiveEvent, RestLiveEvent, WsLiveEvent } from '../../shared/wire-types.js';

/** A live event as the renderer receives it, of any protocol. */
export type LiveEventWire = RestLiveEvent | GrpcLiveEvent | WsLiveEvent;

/**
 * One live event on the wire, as its kind turns it. `keyParams` names the query parameters an API key
 * travels in, which a WebSocket handshake's URL masks whatever they are called.
 *
 * @throws Error for a kind that reports no live events
 */
export function toWireEvent(
  sendId: string,
  event: LiveEvent,
  show: boolean,
  keyParams?: readonly string[],
): LiveEventWire {
  const send = kindSend(event.protocol);
  if (send.liveEvent === undefined) throw new Error(`${event.protocol} sends report no live events`);
  return send.liveEvent(sendId, event, show, keyParams);
}
