import { folderOf, insideKindApi } from '../../commands/command-helpers.js';
import { catalogEntry } from '@shared/command-catalog.js';
import { explorerActions } from '../../features/explorer/explorer-actions.js';
import { registerCommand } from '../../lib/commands.js';
import { copyAsCurl } from '../../features/request-editor/request-actions.js';
import { useExchangesStore } from '../../state/exchanges.js';
import { activeGrpcRequestId, ui } from '../../commands/command-helpers.js';

/** Registers gRPC's own commands (kind modules spec §6.1). */
export function registerGrpcCommands(): void {
  // The gRPC creators, gated the same way on their own container.
  registerCommand({
    ...catalogEntry('grpc.newApi'),
    when: (ctx) => ctx.selection?.kind === 'project',
    whenScope: 'selection.project',
    run: (ctx) => {
      explorerActions.newGrpcApi(ctx.selection?.id);
    },
  });
  registerCommand({
    ...catalogEntry('grpc.newRequest'),
    when: (ctx) => insideKindApi('grpc', ctx.selection),
    whenScope: 'selection.grpcApi',
    run: (ctx) => {
      explorerActions.newGrpcRequest(ctx.selection?.apiId, folderOf(ctx.selection));
    },
  });
  // And a gRPC tab's, under the same chord for the same reason.
  registerCommand({
    ...catalogEntry('grpc.send'),
    when: () => activeGrpcRequestId() !== undefined,
    whenScope: 'editor.grpc',
    run: () => {
      const requestId = activeGrpcRequestId();
      if (requestId !== undefined) {
        void useExchangesStore.getState().sendGrpc(requestId);
      }
    },
  });
  // The gRPC counterpart: the same `request.curl` channel answers with a grpcurl-style command
  // for a gRPC request.
  registerCommand({
    ...catalogEntry('grpc.copyAsCommand'),
    when: () => activeGrpcRequestId() !== undefined,
    whenScope: 'editor.grpc',
    run: () => {
      const requestId = activeGrpcRequestId();
      if (requestId !== undefined) {
        void copyAsCurl(requestId, ui().slideOver.codeShell);
      }
    },
  });
}
