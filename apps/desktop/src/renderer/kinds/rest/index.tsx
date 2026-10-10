import { lazy } from 'react';
import type { RendererKind } from '../renderer-kind.js';
import { restExplorer } from './explorer.js';

// Split out for the same reason as the SOAP editor: its raw-body editor is Monaco.
const RestEditor = lazy(async () => {
  const module = await import('../../features/rest-editor/rest-editor.js');
  return { default: ({ id }: { readonly id: string }) => <module.RestEditor requestId={id} /> };
});

const ApiTab = lazy(async () => {
  const module = await import('../../features/rest-api/api-tab.js');
  return { default: ({ id }: { readonly id: string }) => <module.ApiTab apiId={id} /> };
});

/** REST in the renderer: its request editor and its API tab. */
export const restRenderer: RendererKind = {
  kind: 'rest',
  explorer: restExplorer,
  tabs: [
    {
      kind: 'rest-request',
      idField: 'restRequestId',
      prefix: 'rest:',
      persisted: true,
      Component: RestEditor,
      title: (id, { project }) => project.restRequests[id]?.name,
      dirty: (id, drafts) => drafts.restRequests[id] !== undefined,
    },
    {
      kind: 'api',
      idField: 'apiId',
      prefix: 'api:',
      persisted: true,
      Component: ApiTab,
      title: (id, { project }) => project.apis[id]?.name,
    },
  ],
};
