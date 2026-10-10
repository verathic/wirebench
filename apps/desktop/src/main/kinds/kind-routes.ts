/**
 * Each kind's router methods (spec §5.3), by kind: the same tables `MAIN_KINDS` carries as `routes`.
 *
 * Kept apart from `kind-main.ts` so `window-scope.ts` and `WorkspaceService` do not import the
 * kinds' IPC modules, which import them back.
 */
import type { KindId } from '../../shared/kinds/kind-module.js';
import { grpcRoutes } from './grpc/router.js';
import type { KindRoute } from './kind-main.js';
import { restRoutes } from './rest/router.js';
import { soapRoutes } from './soap/router.js';
import { wsRoutes } from './ws/router.js';

/** Every kind's router table, by kind. */
export const KIND_ROUTES: {
  readonly [K in KindId]: Readonly<Record<string, { readonly method: string; readonly by: KindRoute<unknown>['by'] }>>;
} = {
  soap: soapRoutes,
  rest: restRoutes,
  grpc: grpcRoutes,
  websocket: wsRoutes,
};
