import { grpcApisOf } from '@wirebench/engine';
import type { MainKind } from '../kind-main.js';
import { GrpcHost } from './host.js';
import { grpcRoutes } from './router.js';
import {
  addGrpcFolder,
  grpcApiOwning,
  grpcMutations,
  moveGrpcNode,
  removeGrpcFolder,
  updateGrpcFolder,
} from './mutations.js';

/** gRPC's main half. */
export const grpcMain: MainKind<'grpc'> = {
  kind: 'grpc',
  createHost: (core) => new GrpcHost(core),
  routes: grpcRoutes,
  mutations: grpcMutations,
  tree: {
    ownsApi: (project, apiId) => grpcApisOf(project).some((api) => api.id === apiId),
    ownsNode: (project, nodeId) => grpcApiOwning(project, nodeId) !== undefined,
    addFolder: addGrpcFolder,
    updateFolder: updateGrpcFolder,
    removeFolder: removeGrpcFolder,
    moveNode: moveGrpcNode,
  },
};
