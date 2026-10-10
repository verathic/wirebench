/**
 * The developer switch for the desktop's kinds (kind modules spec §7.3): `WIREBENCH_KINDS`
 * (`grpc=off,websocket=off`), read at start-up like `WIREBENCH_AREAS`. Phase 4 replaces it with
 * Settings and team policy.
 */
import { createBuiltinRegistry, type ProtocolRegistry } from '@wirebench/engine';
import { KINDS, type KindId } from '../../shared/kinds/kind-module.js';
import { parseAreaSwitches } from '../areas.js';

/** The kinds `WIREBENCH_KINDS` leaves on, in the kinds' order. Anything not `<kind>=on|off` is ignored. */
export function enabledKindsFromEnv(env: NodeJS.ProcessEnv = process.env): readonly KindId[] {
  const switches = parseAreaSwitches(env['WIREBENCH_KINDS']);
  return KINDS.filter((kind) => switches[kind.kind] !== false).map((kind) => kind.kind);
}

/**
 * The engine registry for this run: the built-in protocols with the kinds that are off switched off,
 * so a project's containers of those kinds load as placeholders and are saved untouched.
 */
export function kindRegistry(enabled: readonly KindId[]): ProtocolRegistry {
  return createBuiltinRegistry(Object.fromEntries(KINDS.map((kind) => [kind.feature.id, enabled.includes(kind.kind)])));
}
