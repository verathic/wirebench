# Wirebench: the desktop's per-kind contributions — design

Date: 2026-10-10 · Status: draft, awaiting the owner's review · Issue #184 (phase 3 of the epic).
Phase 1 (the protocol registry, PR #185) and phase 2 (one send path, PR #191) are merged.

- Builds on:
  - ADR-0017 (a protocol is a module behind one interface) and the phase 1 and 2 specs
    (`docs/specs/2026-09-30-wirebench-protocol-modules-design.md`,
    `docs/specs/2026-10-01-wirebench-one-send-path-design.md`).
  - ADR-0021 (a desktop area is a module behind one interface), whose split into a shared, a
    renderer and a main half this phase repeats for protocol kinds.
  - ADR-0005 (the renderer never touches the file system) and the renderer's CSP rule that no
    eagerly loaded renderer module value-imports zod schemas or the engine
    (`apps/desktop/test/renderer-eager-imports.test.ts`).
- Decisions recorded here (owner, 2026-10-10):
  - **The engine's four container lists are replaced in this phase.** `Project.interfaces`, `apis`,
    `grpcApis` and `wsApis` become one container map with a typed accessor per protocol (§9). They
    are the published engine's `Project` shape, so the engine's exports break and the release that
    carries this phase is a major: the epic, #77 and #79 moved to the 6.0 milestone.
  - **No IPC channel, event or wire field is renamed.** The channel registry and the wire schemas
    are composed from per-kind files, but every name the renderer and the tests use stays.
  - **One spec, a pull request per slice** (§11). Phase 3 touches about 200 desktop files; one
    pull request would be unreviewable.

## 1. Goal

A protocol's desktop half lives in one folder per kind, in each of the three processes, and the
shell composes them. Adding a kind to the desktop means writing those folders and registering
them, without editing the explorer, the editor area, the tab code, History, Search, the IPC
registry or the project host.

Today ADR-0007's "every protocol-neutral surface needs a `kind` branch" still holds for the
desktop. Measured on `c04957e`:

- `shared/wire-types.ts` is 7,231 lines: about 1,700 SOAP, 1,000 REST, 380 gRPC, 390 WebSocket,
  760 that compose several kinds and 2,850 that are about no protocol. `shared/ipc.ts` declares
  every channel in one literal; its `request.*` and `api.*` groups mix all four kinds.
- `main/project-host.ts` (4,218 lines) holds about 46 SOAP, 16 REST, 13 gRPC and 11 WebSocket
  methods in one class. `ProjectRouter`, `WorkspaceService` and `window-scope.ts` repeat its 70
  routed method names. `main/project-mutations.ts` switches over about 95 change kinds and finds a
  folder's protocol by probing each kind's lists in turn.
- `main/send/exchange.ts` keeps five four-way switches on the item's kind (summarise, record,
  record a failure, and two audit rows); `send/draft.ts`, `send/live.ts`, `sequence-runner.ts`,
  `ipc/history.ts`, `ipc/log.ts` and `ipc/search.ts` switch too.
- In the renderer, 45 files compare against protocol or tab-kind literals. The editor area picks a
  component through an 18-arm ternary, `workspace-tabs.ts` switches over tab kinds four times, and
  the explorer's view, tree builder, context menu and actions branch on 25 node kinds.
- A container of an unknown or disabled kind reaches the desktop only as a `container-unsupported`
  problem string that nothing reads. The engine's `Project.unsupported` is never put on the wire.

### 1.1 In scope

- The engine edges phases 1 and 2 left behind (§2).
- One container map in place of the four lists, and SOAP's model out of core (§9).
- Webhooks and WS-Security configurations loaded and saved by their modules, not by core (§3).
- Per-kind wire types and IPC channels, composed into the existing registry (§4).
- A per-kind main half: mutations, IPC handlers, the project host's methods, the send path's
  per-kind steps, History, the HTTP Log and Search (§5).
- A renderer registry: kind → tabs, editor, API view, explorer rows and menus, History body,
  Search row, commands (§6).
- Placeholders for a container of a disabled or unknown kind, in the explorer and in a restored
  tab; never rewritten (§7).
- ADR-0023, and the docs and changelog that name the per-kind code (§10).

### 1.2 Not in scope

- **Any user-facing switch.** Settings, a CLI flag and team policy are phase 4. Until then a kind
  is off only when a developer builds a registry without it, or through the existing
  `WIREBENCH_AREAS`-style environment variable this phase adds for kinds (§7.3).
- **New behaviour in any editor.** Every screen looks and acts as it does today.
- **The import pickers.** `import-detect.ts` and the import dialog stay closed until phase 7.

## 2. Engine leftovers

The import graph (`scripts/engine-import-graph.mjs`) still allows these core edges, each tagged
with a phase that has merged. This phase removes them.

| Core file | Edge | Change |
|---|---|---|
| `project/history.ts` | WebSocket transcript and frames, SSE rows and caps, the REST contract result | `historyWsOf` moves to `ws/history-entry.ts`, `historySseOf` to `rest/sse-transcript.ts`, `historyContractOf` to `rest/contract-check.ts`. Core keeps structural `HistoryWs`, `HistorySse` and `HistoryContract` shapes, as it already does for gRPC (`HistoryGrpc`). |
| `run/issued-token.ts` | WS-Trust client and model | Moves to `wss/trust/issued-token.ts`. SOAP's run facet gets its per-run source from `scope.memo`. The host-lent source stays on `SendHost` behind a protocol-neutral slot (§2.1). |
| `run/send-helpers.ts` | `SoapFault`, `IssuedToken` (type-only) | `issuedTokenSourceOf`, `dropRejectedIssuedToken` and `TOKEN_REFUSED` move beside the issued-token source. |
| `project/schema.ts` | WS-Security defaults | The typed WS-Security entry schemas move to `wss/schema.ts`. Core keeps the loose stored-entry schema the loader uses. |
| `project/load.ts`, `serialize.ts` | REST's request reader and writer, the webhook model | §3. |
| `project/request-location.ts` | `RestFolder` (type-only) | A storage hook, `requestLocation(container, requestId)`, asked of each enabled module. |
| `secrets/scan/walk.ts`, `apply.ts` | the request types (type-only) | A secrets facet on the module: `scanTargets(project)` and `applyMoves(project, rewriter)`, per project so REST covers the webhook collection in its place. `SecretLocation` keeps its kinds, which the desktop's wire mirrors. |

`RunContext.defaultWsaActionFor` and `loadedDefinitionFor`, the SOAP members of the run context, stay:
they name no protocol folder, only the composition file's `SelectedRequest`.

Left as named exceptions, with their reasons unchanged: `protocols.ts`, `index.ts`,
`project-files.ts`, `import-detect.ts` and the importers and exporters (phase 7). `project/model.ts`
leaves the table with §9.

### 2.1 A protocol's host slot

`SendHost.issuedTokens` becomes `SendHost.protocols`, a record keyed by kind that core passes through
and never reads. SOAP reads its own entry with `soapHostOf(host)` (`soap/host.ts`), and its run facet
shares one issued-token source per run through `scope.memo` when the host lends none, where the run
loop used to create it. The desktop and the CLI put the source they lend today in
`protocols.soap.issuedTokens`.

## 3. Project-level files

`ProtocolStorage` is per container today. Webhooks (REST requests in their own tree) and the
WS-Security outgoing and incoming configurations (SOAP only) are not containers, so core loads and
saves them. A module gains an optional project facet:

```ts
interface ProtocolProjectFiles {
  load(ctx: LoadContext, project: Project): Promise<Project>;
  files(project: Project): ReadonlyMap<string, string>;
  managed(fs: FsLike, root: string): Promise<readonly string[]>;
}
```

- REST's facet reads and writes `webhooks/`; SOAP's reads and writes `wss/outgoing/` and
  `wss/incoming/`. Keystores stay in core: REST and gRPC TLS use them too.
- The loader calls `load` after the containers, in registry order. The writer merges `files` and
  `managed` with the containers'. A disabled module's files are left on disk as a disabled
  container's are, and `WEBHOOKS_FEATURE` goes away: the registry lists only enabled modules.
- The data moves with the files: the webhook collection and the outgoing and incoming
  configurations live in `Project.protocols` (§9), read with `webhooksOf(project)` and
  `wssConfigsOf(project)`. `Project.wss` keeps only the keystores and becomes `Project.keystores`.
- The webhook file schemas move from `project/schema.ts` into `webhooks/schema.ts`, and
  `project-files.ts` lists them from there. The published JSON Schemas are unchanged.

## 4. Shared: wire types and channels per kind

```
apps/desktop/src/shared/
  kinds/
    kind-module.ts      KindModule, KINDS, kindById
    soap/  kind.ts  wire.ts  channels.ts
    rest/  kind.ts  wire.ts  channels.ts      (webhooks, SSE, OpenAPI, Postman, HAR, .http)
    grpc/  kind.ts  wire.ts  channels.ts
    ws/    kind.ts  wire.ts  channels.ts      (AsyncAPI)
  wire-base.ts          what no protocol owns
  wire-types.ts         the composed schemas, and a re-export of every name
  ipc-contract.ts       defineChannel, defineEvent and their types
  ipc.ts                channels and events, composed
```

_As built (slice 4):_ a kind's wire file cannot import `wire-types.ts` while `wire-types.ts` imports
it: zod builds schemas at load time, so the cycle would read a binding before it is set. What no
kind owns is therefore in `wire-base.ts`, which the kinds import; `wire-types.ts` keeps only the
schemas that compose several kinds and re-exports every name. `ipc-contract.ts` holds
`defineChannel` and `defineEvent` for the same reason, so a kind's `channels.ts` never imports the
registry that spreads it.

### 4.1 The shared half of a kind

```ts
interface KindModule<K extends string = string> {
  readonly kind: K;                  // the engine's protocol kind: 'soap', 'rest', 'grpc', 'websocket'
  readonly feature: FeatureDescriptor;  // type-only from the engine, as AreaModule does
  readonly label: string;            // 'SOAP', 'REST', 'gRPC', 'WebSocket'
  readonly tabs: { readonly request: string; readonly container: string };  // today's tab kinds
}
```

`KINDS` is the one ordered list (SOAP, REST, gRPC, WebSocket: the explorer's tie-break order), and
`KindId` is derived from it, as `AreaId` is from `AREAS`. `kind.ts` imports nothing
process-specific and no zod, so the renderer may value-import it.

### 4.2 Wire types

- Each `kinds/<kind>/wire.ts` holds the schemas only that kind uses, moved verbatim with their
  names. What two kinds share (`keyValueWireSchema`, `httpExchangeWireSchema`, `tlsInfoWireSchema`,
  the folder schema REST, gRPC and WebSocket use, `definitionAuthWireSchema`) is in `wire-base.ts`.
  A kind's wire file imports `wire-base.ts` and never another kind's.
- The composition points stay in `wire-types.ts`: `projectWireSchema`, `projectChangeSchema`,
  `historyEntrySchema`, `logEntryWireSchema`, `exchangesGetResponseSchema`, the curl and
  multi-environment unions, the workspace draft maps, and every response that carries a whole
  project. Field names, arm order and union order are unchanged. _As built:_ they name the kinds'
  schemas as they always did rather than spreading a `projectWireFields` or `changeArms` per kind;
  the per-kind lists would only reorder the arms, and main's mutations (§5.2) key on the change
  kind, not on where its arm is written.
- `wire-types.ts` re-exports every moved name for one release, so the 230 test files and 275 source
  files that import it keep compiling; the source files are moved to the kind files in the slice
  that moves the code, and the re-exports are removed in the last slice (§11).
- The eager-import guard's `FORBIDDEN_FILES` covers `shared/kinds/*/wire.ts` and `channels.ts`.

### 4.3 Channels

- `kinds/<kind>/channels.ts` exports the kind's channel fragments by group:
  `restChannels = { request: { sendRest, preflightRest, restBodySchema }, api: { importOpenApi, … },
  exchanges: { saveRestBody }, history: { resendRest } }`, and its events (`rest.live`).
- `ipc.ts` composes `channels` and `events` by spreading each group's core part and each kind's
  fragment. Names, nesting and payloads are unchanged, so `preload/build-api.ts` and the renderer
  see the same `WirebenchApi`.
- A test pins every channel name against today's list, so a slice cannot drop or rename one.
- The composed literal type is the same size as today's; the assertion types stay named
  interfaces for the reason `wire-types.ts` gives.

## 5. Main: one folder per kind

```
apps/desktop/src/main/kinds/
  kind-main.ts          MainKind, MAIN_KINDS
  soap/  mutations.ts  host.ts  ipc.ts  send.ts  history.ts  search.ts  wire.ts
  rest/  …  (webhooks under rest/webhooks/)
  grpc/  …
  ws/    …
```

### 5.1 The main half of a kind

```ts
interface MainKind<K extends KindId = KindId> {
  readonly kind: K;
  /** Applies the change kinds this kind owns. */
  readonly mutations: { readonly [changeKind: string]: (project: Project, change: ProjectChange) => Project };
  /** Its fields of `ProjectWire`, and the entity ids it routes (`WorkspaceService.reindex`). */
  readonly wire: { fields(project: Project, open: OpenProjectView): object; entityIds(wire: ProjectWire): Iterable<string> };
  /** Its share of the project host: caches and methods, built once per open project. */
  createHost(core: ProjectHostCore): object;
  /** Registers its channels against the routed workspace. */
  registerChannels(deps: KindChannelDeps): void;
  /** The send path's per-kind steps (phase 2's `exchange.ts` switches). */
  readonly send: {
    item(draft: unknown, router: ProjectRouter): Promise<SelectedRequest>;
    preview(...): Promise<RequestPreview>;
    summarise(...): unknown;
    record(...): Promise<HistoryEntry | undefined>;
    recordFailure(...): Promise<HistoryEntry | undefined>;
    audit(...): AuditRow;
  };
  readonly history?: { resend(...): Promise<unknown> };
  readonly log?: { resend(...): Promise<unknown>; curl(...): string };
  readonly search?: { matches(wire: ProjectWire, query: SearchQuery): Iterable<SearchMatch> };
}
```

Exact signatures follow the code at planning time; the facets are binding.

### 5.2 Mutations

`applyChange` keeps the core change kinds (sequences, mocks, environments, properties, keystores,
assertions, scripts) and looks every other `change.kind` up in the kinds' `mutations`. A change kind
no kind owns refuses with `unknown-change`. `project-rest-mutations.ts`, `-grpc-`, `-ws-`,
`-webhook-` and `-wss-` move into the kind folders. What gRPC and WebSocket import from REST's
mutations today (`takenApiSlugs`, `toEngineAuthConfig`, `toEngineRows`) moves into a core
`main/project-api-mutations.ts`, so no kind folder imports another.

The cross-kind cases that probe each kind's lists (`add-folder`, `update-folder`, `remove-folder`,
`move-node`) ask each kind whether it owns the API or folder id instead.

_As built (slice 5):_ each kind's table sits at the end of its `mutations.ts`
(`kinds/<kind>/mutations.ts`, REST's webhook changes in `kinds/rest/webhooks/mutations.ts`, the
WS-Security reducers in `kinds/soap/wss-mutations.ts`), and a reducer takes `(project, change, deps)`.
The four folder changes stay core change kinds: core asks each kind's optional `tree` facet
(`ownsApi`, `ownsNode`, and the four reducers) and refuses an id no kind owns with
`project-entity-not-found`. `CORE_CHANGE_KINDS` lists what core applies, so a test can hold every
change kind to exactly one owner.

### 5.3 The project host

`ProjectHost` keeps what is about no protocol: open, close, save, autosave, the watcher, mutate,
keystores, TLS, proxy, secrets, scopes and the run context. Each kind's `createHost` returns an
object holding that kind's caches and methods (`SoapHost`, `RestHost`, `GrpcHost`, `WsHost`), built
on a `ProjectHostCore` the host passes in. `ProjectHost.kind('rest')` returns it.

- `ProjectRouter` becomes the core router plus each kind's router interface, and `window-scope.ts`
  derives `ROUTER_METHODS` from the same per-kind name lists, so a method is declared once per kind
  instead of four times. Routed method names are unchanged.
- The three methods that serve REST and gRPC (`apiDefinitionDocuments`, `apiDefinitionText`,
  `exportApiDefinitionTo`) ask each kind whether it owns the API id.
- `closeInternal`, `hydrateAll` and the post-mutation cache drops call every kind's host.

_As built (slice 5):_ `ProjectHostCore` is a `Pick` of `ProjectHost` (`project-host-core.ts`), so the
members a kind's host reads are public on the host. Each kind declares its router methods once, in
`kinds/<kind>/router.ts`: a table naming the host method each reaches and how its host is found (by
the leading entity id, or by a leading project id that is dropped or kept). `ProjectRouter` extends
the kinds' router types derived from those tables, `window-scope.ts` lists the core's methods and
adds each kind's, and `WorkspaceService` installs the kinds' forwarders on its prototype from the
same tables. Core calls each kind's host through optional hooks (`hydrate`, `close`,
`afterChange`, `wireOptions`, `apiDefinitions`). `preflight` still asks SOAP's host for a request's
default `wsa:Action`, and `mutate` hands SOAP's `addAttachmentFile`, until slice 6 moves the send
path.

### 5.4 IPC

`ipc/request.ts`, `ipc/api.ts`, the resends in `ipc/history.ts` and `ipc/log.ts`, `ipc/search.ts`
and the SOAP-only modules (`definition`, `wsa`, `wss`, `wsi`, `xml`, `xpath`, `validate`,
`attachments`) register through their kind's `registerChannels`. Core IPC modules keep only what
names no kind. The importers that write several kinds' APIs (Postman, `.http`, OpenCollection) stay
in core `ipc/api.ts` until phase 7, and call each kind's host for its part.

_As built (slice 6):_ each `kinds/<k>/ipc.ts` ends with `register<K>Channels(deps: KindChannelDeps)`,
which registers that kind's request, API and History-resend channels; `index.ts` calls every
kind's `registerChannels` once. The core modules export the helpers the kinds' channels share.
The SOAP-only modules moved to `kinds/soap/channels/`. Search and the HTTP log took facets
instead of channels: `ipc/search.ts` walks `MAIN_KINDS` (`search.requests`, then
`search.definitions`), and `log.resend` calls the kind's `log` facet (WebSocket refuses with
`ws-resend-streaming`). The Code panel's `request.curl` stays in core `ipc/request.ts` for now:
its builders share the redaction and network-note helpers there. Tests register channels through
`test/helpers/kind-channels.ts`.

### 5.5 The send path

`send/exchange.ts`, `draft.ts`, `live.ts`, `record.ts` and `sequence-runner.ts` look up the item's
kind in `MAIN_KINDS` instead of switching. `ExchangeRegistry`'s WebSocket session rules stay in
`exchange.ts`, keyed by the module's `interactive` flag rather than the kind name.

_As built (slice 6):_ the per-kind send steps (`selected`, `summarise`, `record`,
`recordFailure`, `sentAudit`, `failedAudit`, `liveEvent`) are each kind's `send` facet in
`kinds/<k>/send.ts`. The send path reads them from `kinds/kind-send.ts` (`KIND_SENDS`) and the
router from `kinds/kind-routes.ts` (`KIND_ROUTES`), not from `MAIN_KINDS`: `kind-main` imports
every kind's channels, which import the send path, so reading `MAIN_KINDS` there closes a cycle.
`test/kind-main-load-order.test.ts` loads each entry first and checks all four kinds are seen.
`isInteractive(kind)` reads `KindModule.interactive`, which only the WebSocket module sets. The
typed per-kind preview functions in `exchange.ts` keep their kind names, since each one is
already a single kind's entry point.

## 6. Renderer: a registry of kinds

```
apps/desktop/src/renderer/kinds/
  index.ts              RendererKind, RENDERER_KINDS, TAB_KINDS
  soap/  index.tsx   rest/  index.tsx   grpc/  index.tsx   ws/  index.tsx
```

### 6.1 The renderer half of a kind

```ts
interface RendererKind {
  readonly kind: KindId;
  /** The tab kinds it owns: today's names, id fields and prefixes. */
  readonly tabs: readonly TabContribution[];
  readonly explorer: {
    containers(project: ProjectView): readonly ExplorerNode[];   // its containers and their trees
    readonly icons: Partial<Record<string, LucideIcon>>;
    readonly testIds: Partial<Record<string, string>>;
    menu(node: ExplorerNode, ctx: MenuContext): readonly MenuGroup[];
    activate(node: ExplorerNode): void;
    rename?(node: ExplorerNode, name: string): Promise<void>;
    remove?(node: ExplorerNode): Promise<void>;
  };
  readonly history: { badge(entry: HistoryEntry): ReactNode; Body?: ComponentType<{ entry: HistoryEntry }>; open(entry): void; resend?(entry): Promise<void> };
  readonly search: { badge?: string; reveal(match: SearchMatch): void };
  readonly registerCommands?: (ctx: CommandContext) => void;
}

interface TabContribution {
  readonly kind: string;              // 'rest-request'
  readonly idField: keyof EditorTab;  // 'restRequestId'
  readonly prefix: string;            // 'rest:'
  readonly persisted: boolean;
  readonly Component: LazyExoticComponent<ComponentType<{ id: string }>>;
  title(id: string, state: ProjectState): string | undefined;
}
```

- `TAB_KINDS` composes the kinds' tab contributions with the generic ones (environment, project,
  history, diff, env-compare, sequence, mock, catch-url, cookies, ssh-terminal), each a
  `TabContribution` too. The editor area renders `TAB_KINDS[tab.kind].Component`; `tabIdFor`,
  `persist`, `titleFor` and `restoreWorkspaceTabs` read the same table. `EditorTab`'s id fields and
  the persisted UI state are unchanged.
- The explorer's tree builder asks each kind for its container nodes and merges them on `order`
  with SOAP, REST, gRPC, WebSocket as the tie-break, as today. Its view, context menu, drag rules
  and actions look a node's kind up in the registry. Folder rows keep their `grpc` and `ws` flags,
  which become `ownerKind`.
- History, Search and the HTTP Log's row menu ask the entry's kind for its badge, body and actions;
  a missing `kind` still means SOAP.
- `renderer/kinds/*/index.tsx` imports each component through `lazy()`, so the eager-import guard
  is unaffected.

_As built (slice 7):_ `RendererKind` carries `tabs`, `explorer`, `requests` (`open`, `exists`),
`history`, `search`, an optional `log` and `registerCommands`.

- **Tabs.** `TAB_KINDS` holds only the tabs that name an entity. A diff, an environment
  comparison, the cookie manager and a terminal stay with the editor area. A row also carries
  `dirty` (the tab's unsaved dot) and `detail` (SOAP's operation name in the tab menu).
- **Explorer.** The explorer facet is a table of node roles by node kind: icon, test id, gutter
  badge, API badge, click behaviour, movable, drop target, open, rename, remove and menu. It also
  has `newRequestIn`, `importCurlIn`, `ownsApi`, and the confirm dialog's `deletions`.
- **Explorer tree.** The tree contribution is a pure `kinds/<kind>/explorer-tree.ts`, listed in
  `kinds/explorer-trees.ts`, so `tree-nodes.ts` and its tests do not load the editors. REST, gRPC
  and WebSocket share one folder walker (`features/explorer/container-tree.ts`). Folder rows carry
  `ownerKind`.
- **History, Search and Log.** The WebSocket and event-stream History bodies moved into
  `kinds/ws` and `kinds/rest` and load lazily. SOAP's search reveal moved to
  `kinds/soap/search.ts`.
- **Still in core.** Webhook, sequence, mock and values rows stay in core. So do the log's name
  column (`log-name.ts`), the `active*RequestId` command helpers, and the commands that span
  kinds (send to environments, cancel, Show code).

### 6.2 Store slices

The project store keeps its per-kind maps (`restRequests`, `grpcApis`, …) because the wire keeps its
fields. The four draft maps and the four exchange maps stay too. Putting them behind one map per
kind is renderer churn with no behaviour, and is left for a later change to the wire.

## 7. Placeholders

### 7.1 On the wire

`ProjectWire` gains `unsupported: { dir, slug, kind, reason, name?, order? }[]`, copied from
`Project.unsupported`. A container whose kind's desktop half is missing (a kind the engine knows and
the desktop does not) is added with `reason: 'unknown-kind'`, and the engine still loads and saves
it.

### 7.2 In the renderer

- The explorer shows each placeholder as a dimmed container row at its `order`, labelled with its
  name (or slug) and kind. Its tooltip and only menu item say why: "REST is switched off" or "This
  project uses a kind this version of Wirebench does not know (graphql)". It has no children, cannot
  be renamed, moved or deleted, and opens nothing.
- A restored tab whose kind is off, or whose entity is a placeholder's, opens a placeholder panel
  with the same text instead of an empty panel.
- Search, History and the HTTP Log show an entry of a kind that is off with its saved text and no
  resend or open action.

### 7.3 Turning a kind off

`WIREBENCH_KINDS` (`grpc=off,websocket=off`), read in main at start-up like `WIREBENCH_AREAS`, builds
the engine registry with those switches and tells the renderer the enabled kinds through
`app.areas`'s sibling, `app.kinds`. A kind that is off registers no channels and no commands. This is
a developer switch; phase 4 replaces it with Settings and team policy.

### 7.4 Never rewritten

The engine already refuses to rewrite or delete a placeholder's files (ADR-0017). The desktop adds
nothing that could: a placeholder has no id the mutations accept. A test opens a project with a
disabled kind, edits and saves another container, and compares the disabled container's files byte
for byte.

_As built (slice 8):_ main does not thread the registry through each load and save: the engine's
`setDefaultRegistry` (`@internal`) makes the switched registry the process default at start-up
(`main/kinds/enabled-kinds.ts`). `ProjectWire.unsupported` is optional, so a project with none
sends nothing new. A kind that is off registers none of its channels at all, so a call to one fails as
an unknown channel rather than with `feature-disabled`; the renderer never makes one, since it
registers none of the kind's commands and shows its containers as placeholders. The shell files'
guard (`test/kind-literals.test.ts`) allows union members, which declare a row kind, and the typed
preview entry points in `exchange.ts`, which ask for their own kind's preview by name. The WebSocket
session follower moved to `main/kinds/ws/session.ts`, and each kind's `keyMasks` send facet gives the
API key names a send masks.

_As built (after review):_ main refuses a change, a folder change in an API, or a routed host call
through a kind that is off with `feature-disabled` (`details.feature`), as the engine refuses a
feature; the enabled kinds reach `applyChange` from `index.ts` through `WorkspaceService` and the
project host's hooks. A kind's project-level files go with it: REST's `webhooks/` and SOAP's `wss/`
are neither loaded nor saved while it is off, so at open main asks the off module's
`projectFiles.managed` what is on disk and adds one placeholder per folder (`dir` widened to any
folder). The WS-Security view keeps the keystores, which every kind uses, and says SOAP is off in
place of the configurations. REST reads no WS-Security configuration, so soap=off changes no REST
send.

## 8. Errors

- New: `unknown-change` (a `ProjectChange` no kind owns; a programming error that reaches the
  renderer as today's `invalid-change`).
- `feature-disabled` reaches the renderer unchanged when a channel of a kind that is off is called
  anyway.

## 9. One container map

```ts
interface Project {
  …
  /** Every container, keyed by kind, in load order. A kind with none may be absent. */
  readonly containers: Readonly<Record<string, readonly ContainerBase[]>>;
  /** What a protocol keeps for the whole project, keyed by kind (REST: the webhook collection). */
  readonly protocols?: Readonly<Record<string, unknown>>;
  readonly keystores: readonly WssRef[];
}
```

- `interfaces`, `apis`, `grpcApis`, `wsApis` and `extraContainers` are removed, and so are `webhooks`
  and `wss`. Each protocol's folder exports a typed reader and writer: `soapInterfacesOf` /
  `withSoapInterfaces`, `restApisOf` / `withRestApis`, `grpcApisOf` / `withGrpcApis`, `wsApisOf` /
  `withWsApis`, `webhooksOf` / `withWebhooks`, `wssConfigsOf` / `withWssConfigs`. The storage facet's
  `containers` and `withContainers` read the map, so a module never needs its own field.
- SOAP's model (`Interface`, `OperationDef`, `SoapRequestDef`, `Endpoint`, `Attachment`,
  `RequestProperties` and their factories) moves from `project/model.ts` to `soap/model.ts`, and
  `AnyRequestDef` to `protocols.ts`. `project/model.ts` then names no protocol.
- `takenContainerSlugs` and `nextApiOrder` read the map, so they count every kind, built in or not.
- Every name keeps its export from `@wirebench/engine`; only the `Project` fields change. The engine
  README's migration table lists each removed field and its reader.
- The desktop's `ProjectWire` keeps its per-kind fields (§4.2): the change stops at main.

## 10. Documentation

- ADR-0023: a desktop kind is a module behind one interface, split shared, main and renderer as
  ADR-0021's areas are.
- ADR-0017's exception table and `CORE_EXCEPTIONS` lose the rows §2, §3 and §9 remove.
- `packages/engine/README.md`: the removed `Project` fields and `SendHost.issuedTokens`, with what
  replaces each.
- `docs/architecture/overview.md`: the desktop's per-kind folders.
- `CHANGELOG.md`: the placeholder row and `WIREBENCH_KINDS` under Added, and the engine's changed
  `Project` and `SendHost` under Changed (breaking) for 6.0.0.

_As built (slice 8):_ ADR-0017's exception table had already lost its rows in slices 1 to 3; its
consequences gained an amendment pointing to ADR-0023. The engine README lists `setDefaultRegistry`
under its 6.0 notes, and the CHANGELOG's 6.0 Breaking list gains it beside the `Project` and
`SendHost` entries. The `wire-types.ts` re-exports are gone: every import names the file that
declares the name, rewritten over the TypeScript AST.

## 11. Slices

Each slice is its own pull request against `main`, keeps `pnpm check` and e2e green, and changes no
behaviour except where it says so.

1. **Engine leftovers** (§2): history records, issued tokens and the host slot, the WS-Security
   entry schemas.
2. **One container map** (§9), in two pull requests:
   1. the map, the typed readers and writers, and request location (§2);
   2. SOAP's model out of core, the secrets facet (§2), and `workspace/reidentify.ts` reading SOAP's
      containers through a module rather than its own exception.
3. **Project-level files** (§3): webhooks into REST, WS-Security configurations into SOAP,
   `Project.keystores`.
4. **Shared** (§4): `shared/kinds/`, wire types and channels per kind, composed; the channel-name
   test; `FORBIDDEN_FILES`.
5. **Main, mutations and host** (§5.1–5.3): `main/kinds/`, mutations, `createHost`, the router.
6. **Main, IPC and send** (§5.4–5.5): channel registration, the send path, History, Log, Search.
7. **Renderer** (§6): `renderer/kinds/`, `TAB_KINDS`, the editor area, workspace tabs, explorer,
   History, Search, commands.
8. **Placeholders** (§7) and the docs (§10); the `wire-types.ts` re-exports removed.

## 12. Testing

- The existing suites are the guard for slices 1 to 7: they change only their imports, and in
  slices 2 and 3 how a test builds a `Project`.
- Engine: `pnpm check:engine-layers` with the removed exceptions; the test-only fifth protocol
  gains a webhook-like project facet and a secrets facet, so a module that is not built in goes
  through both.
- Desktop: the channel-name test (§4.3); a test that no file outside `kinds/` names a kind literal
  in the shell files (`editor-area.tsx`, `workspace-tabs.ts`, the explorer's view and tree builder,
  `exchange.ts`, `project-mutations.ts`); the placeholder tests in §7.4; e2e opens a project with
  `WIREBENCH_KINDS=grpc=off` and sees the placeholder row.
- Gates: `WIREBENCH_SKIP_PERF=1 pnpm check` per task, `pnpm test:perf` before a push, e2e in CI.

## 13. Risks

1. **Size.** About 200 desktop files move, and slice 2 rewrites how about 1,400 places read the
   lists; it is done with a codemod over the TypeScript AST, not by hand. Each slice is mechanical where it can be (moves keep names), and
   the re-exports keep imports compiling until the last slice.
2. **The composed channel type gets too big for the compiler.** Spreading fragments keeps the same
   members; if the serialisation limit bites, the fragments become named interfaces, as the
   assertion types did.
3. **The eager-import guard misses a new file.** `FORBIDDEN_FILES` is extended in slice 3, and the
   guard test checks every file under `shared/kinds/` that imports zod is in it.
4. **A placeholder is rewritten through a path this spec missed.** The byte-for-byte test (§7.4)
   runs a save after every kind of change on another container.
