import { restApisOf } from '@wirebench/engine';
import type { MainKind } from '../kind-main.js';
import { RestHost } from './host.js';
import { restRoutes } from './router.js';
import { addFolder, moveNode, removeFolder, restMutations, restOwnsNode, updateFolder } from './mutations.js';
import { webhookMutations } from './webhooks/mutations.js';

/** REST's main half; the webhook collection is REST's too. */
export const restMain: MainKind<'rest'> = {
  kind: 'rest',
  createHost: (core) => new RestHost(core),
  routes: restRoutes,
  mutations: { ...restMutations, ...webhookMutations },
  tree: {
    ownsApi: (project, apiId) => restApisOf(project).some((api) => api.id === apiId),
    ownsNode: restOwnsNode,
    addFolder,
    updateFolder,
    removeFolder,
    moveNode,
  },
};
