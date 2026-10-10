/**
 * The main half of each kind (spec §5.1): what main does for one protocol, kept in that kind's folder
 * under `main/kinds/<kind>/` and listed once in {@link MAIN_KINDS}. Core code asks the list rather
 * than switching on a kind's name.
 */

import type { Project } from '@wirebench/engine';
import type { KindId } from '../../shared/kinds/kind-module.js';
import type { ProjectChange, RestFolderPatchWire } from '../../shared/wire-types.js';
import type { ProjectHostCore } from '../project-host-core.js';
import type { ProjectWireContext } from '../project-wire.js';
import type { MutationDeps, MutationResult } from '../project-mutations.js';
import type { GrpcHost } from './grpc/host.js';
import type { RestHost } from './rest/host.js';
import type { SoapHost } from './soap/host.js';
import type { WsHost } from './ws/host.js';
import type { GrpcRouter } from './grpc/router.js';
import type { RestRouter } from './rest/router.js';
import type { SoapRouter } from './soap/router.js';
import type { WsRouter } from './ws/router.js';
import { grpcMain } from './grpc/kind.js';
import { restMain } from './rest/kind.js';
import { soapMain } from './soap/kind.js';
import { wsMain } from './ws/kind.js';

export type ChangeKind = ProjectChange['kind'];
export type ChangeOf<K extends ChangeKind> = Extract<ProjectChange, { kind: K }>;

/** Applies one change kind. Pure apart from what `deps` does; never mutates `project`. */
export type ChangeReducer<K extends ChangeKind = ChangeKind> = (
  project: Project,
  change: ChangeOf<K>,
  deps: MutationDeps,
) => MutationResult | Promise<MutationResult>;

/** The change kinds a kind owns, each with its reducer. */
export type KindMutations = { readonly [K in ChangeKind]?: ChangeReducer<K> };

/**
 * A kind whose APIs hold folders: the folder and move changes name a folder, an API or a node, and
 * core asks each kind whether the id is its own (spec §5.2).
 */
export interface KindTree {
  ownsApi(project: Project, apiId: string): boolean;
  /** Whether the folder or request with this id sits in one of this kind's trees. */
  ownsNode(project: Project, nodeId: string): boolean;
  addFolder(
    project: Project,
    input: { readonly apiId: string; readonly parentId?: string; readonly name: string },
  ): MutationResult;
  updateFolder(project: Project, folderId: string, patch: RestFolderPatchWire): MutationResult;
  removeFolder(project: Project, folderId: string): MutationResult;
  moveNode(
    project: Project,
    input: { readonly nodeId: string; readonly parentId?: string; readonly index: number },
  ): MutationResult;
}

/** The documents cached for an API's definition, as the Definition card lists them. */
export interface ApiDefinitionDocuments {
  readonly documents: readonly { location: string; size: number }[];
  readonly rootLocation: string;
  readonly fetchedAt: string;
  readonly declaredVersion?: string;
}

/** A kind whose APIs cache a definition the Definition card can list, show and export. */
export interface KindApiDefinitions {
  ownsApi(apiId: string): boolean;
  apiDefinitionDocuments(apiId: string): Promise<ApiDefinitionDocuments>;
  apiDefinitionText(apiId: string, location: string): Promise<string>;
  exportApiDefinitionTo(apiId: string, dir: string): Promise<string[]>;
}

/**
 * What core asks of every kind's host (spec §5.3), each optional: `ProjectHost` calls them in turn
 * rather than naming a kind.
 */
export interface KindHostHooks {
  /** After an open: what the kind loads in the background (SOAP re-imports each interface). */
  hydrate?(): Promise<void>;
  /** As the project closes: drops what belongs to it alone. */
  close?(project: Project): void;
  /** After a change is applied: drops what the change made stale. */
  afterChange?(change: ProjectChange): void;
  /** What the kind adds to the snapshot's options. */
  wireOptions?(): Partial<ProjectWireContext>;
  /** Present when the kind's APIs cache a definition. */
  readonly apiDefinitions?: KindApiDefinitions;
}

/** Each kind's host, by kind (spec §5.3). */
export interface KindHosts {
  readonly soap: SoapHost & KindHostHooks;
  readonly rest: RestHost & KindHostHooks;
  readonly grpc: GrpcHost & KindHostHooks;
  readonly websocket: WsHost & KindHostHooks;
}

/**
 * How one of a kind's router methods reaches the kind's host (spec §5.3). `entity` finds the host by
 * the entity id the call takes first and passes every argument on; `project` finds it by a leading
 * project id and passes the rest; `project-kept` finds it by a leading project id and passes that on
 * too, for a host method that takes the project id itself.
 */
export interface KindRoute<H> {
  readonly method: keyof H & string;
  readonly by: 'entity' | 'project' | 'project-kept';
}

/** The router methods a kind's route table declares, typed from its host's methods. */
export type KindRouter<H, R extends Readonly<Record<string, KindRoute<H>>>> = {
  [N in keyof R]: H[R[N]['method']] extends (...args: infer A) => infer Result
    ? R[N]['by'] extends 'project'
      ? (projectId: string, ...args: A) => Result
      : (...args: A) => Result
    : never;
};

/** Every kind's router methods, which `ProjectRouter` adds to the core's. */
export type KindRouters = SoapRouter & RestRouter & GrpcRouter & WsRouter;

export interface MainKind<K extends KindId = KindId> {
  readonly kind: K;
  /** Its share of the project host: caches and methods, built once per open project. */
  createHost(core: ProjectHostCore): KindHosts[K];
  /** Its router methods, each naming the host method it reaches (spec §5.3). */
  readonly routes: Readonly<Record<string, { readonly method: string; readonly by: KindRoute<unknown>['by'] }>>;
  /** Applies the change kinds this kind owns. */
  readonly mutations: KindMutations;
  readonly tree?: KindTree;
}

/** Any one kind's main half. */
export type AnyMainKind = { [K in KindId]: MainKind<K> }[KindId];

export const MAIN_KINDS: readonly AnyMainKind[] = [soapMain, restMain, grpcMain, wsMain];

/** The kind that owns `changeKind`, if any. */
export function mutationOwner(changeKind: string): AnyMainKind | undefined {
  return MAIN_KINDS.find((kind) => Object.hasOwn(kind.mutations, changeKind));
}
