import { lazy } from 'react';
import type { RendererKind } from '../renderer-kind.js';

// Split out like the gRPC editor: its saved-message editor and frame viewer are Monaco.
const WsEditor = lazy(async () => {
  const module = await import('../../features/ws-editor/ws-editor.js');
  return { default: ({ id }: { readonly id: string }) => <module.WsEditor requestId={id} /> };
});

const WsApiTab = lazy(async () => {
  const module = await import('../../features/ws-api/ws-api-tab.js');
  return { default: ({ id }: { readonly id: string }) => <module.WsApiTab apiId={id} /> };
});

/** WebSocket in the renderer: its request editor and its API tab. */
export const wsRenderer: RendererKind = {
  kind: 'websocket',
  tabs: [
    {
      kind: 'ws-request',
      idField: 'wsRequestId',
      prefix: 'ws:',
      persisted: true,
      Component: WsEditor,
      title: (id, { project }) => project.wsRequests[id]?.name,
      dirty: (id, drafts) => drafts.wsRequests[id] !== undefined,
    },
    {
      kind: 'ws-api',
      idField: 'wsApiId',
      prefix: 'ws-api:',
      persisted: true,
      Component: WsApiTab,
      title: (id, { project }) => project.wsApis[id]?.name,
    },
  ],
};
