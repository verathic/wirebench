import { lazy } from 'react';
import type { RendererKind } from '../renderer-kind.js';
import { grpcExplorer } from './explorer.js';

// Split out like the REST editor: its message editor is Monaco.
const GrpcEditor = lazy(async () => {
  const module = await import('../../features/grpc-editor/grpc-editor.js');
  return { default: ({ id }: { readonly id: string }) => <module.GrpcEditor requestId={id} /> };
});

const GrpcApiTab = lazy(async () => {
  const module = await import('../../features/grpc-api/grpc-api-tab.js');
  return { default: ({ id }: { readonly id: string }) => <module.GrpcApiTab apiId={id} /> };
});

/** gRPC in the renderer: its request editor and its API tab. */
export const grpcRenderer: RendererKind = {
  kind: 'grpc',
  explorer: grpcExplorer,
  tabs: [
    {
      kind: 'grpc-request',
      idField: 'grpcRequestId',
      prefix: 'grpc:',
      persisted: true,
      Component: GrpcEditor,
      title: (id, { project }) => project.grpcRequests[id]?.name,
      dirty: (id, drafts) => drafts.grpcRequests[id] !== undefined,
    },
    {
      kind: 'grpc-api',
      idField: 'grpcApiId',
      prefix: 'grpc-api:',
      persisted: true,
      Component: GrpcApiTab,
      title: (id, { project }) => project.grpcApis[id]?.name,
    },
  ],
};
