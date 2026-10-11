import { catalogEntry } from '@shared/command-catalog.js';
import { explorerActions } from '../../features/explorer/explorer-actions.js';
import { registerCommand } from '../../lib/commands.js';
import { useProjectStore } from '../../state/project.js';
import { getActiveRequestPaneHandle } from '../../editor/active-request-editor.js';
import {
  addAttachmentsThroughPicker,
  removeSelectedAttachment,
} from '../../features/request-editor/attachment-actions.js';
import { copyAsCurl, recreateRequest } from '../../features/request-editor/request-actions.js';
import { openRequestDialog } from '../../features/request-editor/request-dialogs.js';
import { validateAndReport } from '../../features/request-editor/validate-actions.js';
import { addWsaHeadersToEditor, removeWsaHeadersFromEditor } from '../../features/request-editor/wsa-actions.js';
import { checkWsiForRequest, lastSendId } from '../../features/request-editor/wsi-actions.js';
import { applyOutgoingWssToEditor, removeOutgoingWssFromEditor } from '../../features/request-editor/wss-actions.js';
import { useEditorsStore } from '../../state/editors.js';
import { useExchangesStore } from '../../state/exchanges.js';
import { activeRequestId, onActiveRequest } from '../../commands/command-helpers.js';
import { useWsiStore } from '../../state/wsi.js';

/** Registers SOAP's own commands (kind modules spec §6.1). */
export function registerSoapCommands(): void {
  // Every explorer context-menu action is also a command, so the palette can run it against
  // whatever node is currently selected. The menu itself (context-menu.tsx) owns the actual
  // logic; these mirror the same `when` gates so the palette only lists what applies.
  registerCommand({
    ...catalogEntry('explorer.importAnother'),
    when: (ctx) => ctx.selection?.kind === 'interface',
    whenScope: 'selection.interface',
    run: () => {
      explorerActions.importAnother();
    },
  });
  registerCommand({
    ...catalogEntry('explorer.removeInterface'),
    when: (ctx) => ctx.selection?.kind === 'interface',
    whenScope: 'selection.interface',
    run: (ctx) => {
      explorerActions.removeInterface(ctx.selection?.interfaceId);
    },
  });
  registerCommand({
    ...catalogEntry('explorer.showInterface'),
    when: (ctx) => ctx.selection?.kind === 'interface',
    whenScope: 'selection.interface',
    run: (ctx) => {
      explorerActions.showInterface(ctx.selection?.interfaceId);
    },
  });
  registerCommand({
    ...catalogEntry('explorer.updateDefinition'),
    when: (ctx) => ctx.selection?.kind === 'interface',
    whenScope: 'selection.interface',
    run: (ctx) => {
      explorerActions.updateDefinition(ctx.selection?.interfaceId);
    },
  });
  registerCommand({
    ...catalogEntry('explorer.exportDefinition'),
    when: (ctx) => ctx.selection?.kind === 'interface',
    whenScope: 'selection.interface',
    run: (ctx) => {
      explorerActions.exportDefinition(ctx.selection?.interfaceId);
    },
  });
  registerCommand({
    ...catalogEntry('explorer.generateDocs'),
    when: (ctx) => ctx.selection?.kind === 'interface',
    whenScope: 'selection.interface',
    run: (ctx) => {
      explorerActions.generateDocs(ctx.selection?.interfaceId);
    },
  });
  registerCommand({
    ...catalogEntry('explorer.copyDefinitionUrl'),
    when: (ctx) => ctx.selection?.kind === 'interface',
    whenScope: 'selection.interface',
    run: (ctx) => {
      explorerActions.copyDefinitionUrl(ctx.selection?.interfaceId);
    },
  });
  registerCommand({
    ...catalogEntry('explorer.newRequest'),
    when: (ctx) => ctx.selection?.kind === 'operation',
    whenScope: 'selection.operation',
    run: (ctx) => {
      explorerActions.newRequest(ctx.selection?.interfaceId, ctx.selection?.bindingName, ctx.selection?.operationName);
    },
  });
  registerCommand({
    ...catalogEntry('explorer.copySoapAction'),
    when: (ctx) => ctx.selection?.kind === 'operation',
    whenScope: 'selection.operation',
    run: (ctx) => {
      explorerActions.copySoapAction(ctx.selection?.soapAction);
    },
  });
  registerCommand({
    ...catalogEntry('explorer.openRequest'),
    when: (ctx) => ctx.selection?.kind === 'request',
    whenScope: 'selection.request',
    run: (ctx) => {
      explorerActions.openRequest(ctx.selection?.requestId);
    },
  });
  registerCommand({
    ...catalogEntry('explorer.cloneRequest'),
    when: (ctx) => ctx.selection?.kind === 'request',
    whenScope: 'selection.request',
    run: (ctx) => {
      explorerActions.cloneRequest(ctx.selection?.requestId);
    },
  });
  registerCommand({
    ...catalogEntry('explorer.renameRequest'),
    when: (ctx) => ctx.selection?.kind === 'request',
    whenScope: 'selection.request',
    run: (ctx) => {
      explorerActions.renameRequest(ctx.selection?.requestId);
    },
  });
  registerCommand({
    ...catalogEntry('explorer.deleteRequest'),
    when: (ctx) => ctx.selection?.kind === 'request',
    whenScope: 'selection.request',
    run: (ctx) => {
      explorerActions.deleteRequest(ctx.selection?.requestId);
    },
  });
  registerCommand({
    ...catalogEntry('explorer.recreateRequest'),
    when: (ctx) => ctx.selection?.kind === 'request',
    whenScope: 'selection.request',
    run: (ctx) => {
      explorerActions.recreateRequest(ctx.selection?.requestId);
    },
  });
  registerCommand({
    ...catalogEntry('explorer.checkWsiWsdl'),
    when: (ctx) => ctx.selection?.kind === 'interface',
    whenScope: 'selection.interface',
    run: (ctx) => {
      explorerActions.checkWsiWsdl(ctx.selection?.interfaceId);
    },
  });
  registerCommand({
    ...catalogEntry('explorer.copyEndpointAddress'),
    when: (ctx) => ctx.selection?.kind === 'endpoint',
    whenScope: 'selection.endpoint',
    run: (ctx) => {
      explorerActions.copyEndpointAddress(ctx.selection?.address);
    },
  });
  registerCommand({
    ...catalogEntry('request.send'),
    when: () => activeRequestId() !== undefined,
    whenScope: 'editor.request',
    run: () => {
      const requestId = activeRequestId();
      if (requestId !== undefined) {
        void useExchangesStore.getState().send(requestId);
      }
    },
  });
  registerCommand({
    ...catalogEntry('request.validate'),
    when: () => activeRequestId() !== undefined,
    whenScope: 'editor.request',
    run: () => {
      const requestId = activeRequestId();
      if (requestId === undefined) {
        return;
      }
      // Flush first: the debounced envelope edit may not have reached the store yet, and
      // validating a stale copy would put markers on lines the user has already changed.
      getActiveRequestPaneHandle()?.flush();
      void validateAndReport(requestId, 'request', useProjectStore.getState().requests[requestId]?.envelopeXml);
    },
  });
  registerCommand({
    ...catalogEntry('response.validate'),
    whenScope: 'editor.request',
    when: () => {
      const requestId = activeRequestId();
      return (
        requestId !== undefined && useExchangesStore.getState().byRequest[requestId]?.exchange?.response !== undefined
      );
    },
    run: () => {
      const requestId = activeRequestId();
      const envelopeXml =
        requestId === undefined
          ? undefined
          : useExchangesStore.getState().byRequest[requestId]?.exchange?.response?.envelopeXml;
      if (requestId === undefined || envelopeXml === undefined) {
        return;
      }
      void validateAndReport(requestId, 'response', envelopeXml);
    },
  });
  registerCommand({
    ...catalogEntry('request.checkWsi'),
    // The message assertions judge bytes on the wire, so there has to be an exchange to judge.
    whenScope: 'editor.request',
    when: () => {
      const requestId = activeRequestId();
      return requestId !== undefined && lastSendId(requestId) !== undefined;
    },
    run: () => {
      const requestId = activeRequestId();
      if (requestId !== undefined) {
        void checkWsiForRequest(requestId);
      }
    },
  });
  registerCommand({
    ...catalogEntry('request.exportWsiReport'),
    // The console's WS-I Report tab holds exactly one report — whichever check ran last — so
    // there is something to export only once one has.
    when: () => useWsiStore.getState().report !== undefined,
    whenScope: 'wsi.report',
    run: () => void useWsiStore.getState().exportHtml(),
  });
  registerCommand({
    ...catalogEntry('request.recreateKeepValues'),
    when: () => activeRequestId() !== undefined,
    whenScope: 'editor.request',
    run: onActiveRequest((requestId) => void recreateRequest(requestId, 'keep-values')),
  });
  registerCommand({
    ...catalogEntry('request.recreateDiscardValues'),
    when: () => activeRequestId() !== undefined,
    whenScope: 'editor.request',
    run: onActiveRequest((requestId) => void recreateRequest(requestId, 'discard-values')),
  });
  registerCommand({
    ...catalogEntry('request.createEmpty'),
    when: () => activeRequestId() !== undefined,
    whenScope: 'editor.request',
    run: onActiveRequest((requestId) => void recreateRequest(requestId, 'empty')),
  });
  registerCommand({
    ...catalogEntry('request.clone'),
    when: () => activeRequestId() !== undefined,
    whenScope: 'editor.request',
    run: onActiveRequest((requestId) => {
      openRequestDialog('clone', requestId);
    }),
  });
  registerCommand({
    ...catalogEntry('request.copyCurl'),
    when: () => activeRequestId() !== undefined,
    whenScope: 'editor.request',
    run: onActiveRequest((requestId) => void copyAsCurl(requestId, 'posix')),
  });
  registerCommand({
    ...catalogEntry('request.copyCurlPowerShell'),
    when: () => activeRequestId() !== undefined,
    whenScope: 'editor.request',
    run: onActiveRequest((requestId) => void copyAsCurl(requestId, 'powershell')),
  });
  registerCommand({
    ...catalogEntry('request.importCurl'),
    when: () => activeRequestId() !== undefined,
    whenScope: 'editor.request',
    run: onActiveRequest((requestId) => {
      openRequestDialog('import-curl', requestId);
    }),
  });
  // The attachments inspector's two toolbar actions, reachable without opening the strip. Both
  // go through `attachmentActions`, so the palette and the inspector cannot drift apart.
  registerCommand({
    ...catalogEntry('request.addAttachment'),
    when: () => activeRequestId() !== undefined,
    whenScope: 'editor.request',
    run: onActiveRequest((requestId) => void addAttachmentsThroughPicker(requestId)),
  });
  registerCommand({
    ...catalogEntry('request.removeAttachment'),
    whenScope: 'editor.request',
    when: () => {
      const requestId = activeRequestId();
      return requestId !== undefined && useEditorsStore.getState().selectedAttachmentFor(requestId) !== undefined;
    },
    run: onActiveRequest((requestId) => void removeSelectedAttachment(requestId)),
  });
  // The four WS-Security editor actions. Unlike the request's `wssOutgoingRef` (which applies a
  // configuration on its way to the wire), these bake a header into the envelope text itself.
  registerCommand({
    ...catalogEntry('request.addWssUsernameToken'),
    when: () => activeRequestId() !== undefined,
    whenScope: 'editor.request',
    run: onActiveRequest((requestId) => {
      openRequestDialog('wss-username-token', requestId);
    }),
  });
  registerCommand({
    ...catalogEntry('request.addWsTimestamp'),
    when: () => activeRequestId() !== undefined,
    whenScope: 'editor.request',
    run: onActiveRequest((requestId) => {
      openRequestDialog('wss-timestamp', requestId);
    }),
  });
  registerCommand({
    ...catalogEntry('request.applyOutgoingWss'),
    when: () => activeRequestId() !== undefined,
    whenScope: 'editor.request',
    run: onActiveRequest((requestId) => void applyOutgoingWssToEditor(requestId)),
  });
  registerCommand({
    ...catalogEntry('request.removeOutgoingWss'),
    when: () => activeRequestId() !== undefined,
    whenScope: 'editor.request',
    run: onActiveRequest((requestId) => void removeOutgoingWssFromEditor(requestId)),
  });
  // The two WS-Addressing editor actions, the counterpart of the request's saved WS-A
  // configuration: these bake the headers into the envelope text rather than applying them on
  // the way to the wire.
  registerCommand({
    ...catalogEntry('request.addWsaHeaders'),
    when: () => activeRequestId() !== undefined,
    whenScope: 'editor.request',
    run: onActiveRequest((requestId) => void addWsaHeadersToEditor(requestId)),
  });
  registerCommand({
    ...catalogEntry('request.removeWsaHeaders'),
    when: () => activeRequestId() !== undefined,
    whenScope: 'editor.request',
    run: onActiveRequest((requestId) => void removeWsaHeadersFromEditor(requestId)),
  });
}
