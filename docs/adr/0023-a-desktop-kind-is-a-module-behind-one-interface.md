# ADR-0023: A desktop kind is a module behind one interface

- Status: accepted
- Date: 2026-10-11
- Context: #184 phase 3; `docs/specs/2026-10-10-wirebench-desktop-kind-modules-design.md`. The desktop-side
  counterpart of ADR-0017, split by process as ADR-0021's areas are. Keeps ADR-0002 (the engine runs in main) and
  ADR-0005 (the renderer never touches the file system).

## Context

ADR-0017 took the protocols out of the engine's core, but the desktop still named them everywhere. Main's mutations,
host, router, IPC handlers and send path branched on `'soap' | 'rest' | 'grpc' | 'websocket'`; in the renderer, 45
files compared against protocol or tab-kind literals, from the editor area and workspace tabs to the explorer,
History, Search, the HTTP Log and the command registry. A fifth kind meant editing all of them, and none could leave a
kind out: a project holding a container of a kind the build did not know showed nothing for it.

## Decision

**One contract, split by process.** A kind is three halves, each composed in one static list:

- the **shared half** (`shared/kinds/<kind>/kind.ts`, listed in `KINDS` in `shared/kinds/kind-module.ts`) is its id,
  its engine `FeatureDescriptor`, its label and its tab kinds. `KindId` is derived from the list. Next to it are the
  kind's wire schemas (`wire.ts`) and its IPC channel fragments (`channels.ts`), which `wire-types.ts` and `ipc.ts`
  compose; what no kind owns is in `wire-base.ts`;
- the **main half** (`main/kinds/<kind>/`, listed in `MAIN_KINDS`) gives the kind's mutations, its project host and
  router, its IPC channels, its send steps (`KIND_SENDS`), and its History, Log and Search facets;
- the **renderer half** (`renderer/kinds/<kind>/`, listed in `RENDERER_KINDS`) gives its tabs (`TAB_KINDS`), its
  explorer tree and row roles (`EXPLORER_TREES`), its History, Search and Log facets and its commands.

The shell reads the lists and names no kind. A test pins it for the files that used to branch most
(`editor-area.tsx`, `workspace-tabs.ts`, the explorer's view and tree builder, `exchange.ts`, `project-mutations.ts`).

**A feature switch.** `WIREBENCH_KINDS` (`grpc=off,websocket=off`) is read in main at start-up, as `WIREBENCH_AREAS`
is. Main builds the engine registry from it once and passes it through each workspace to every project host, which
hands it to every load, save and send; it registers no channel of a kind that is off, and tells the renderer the enabled kinds through `app.kinds`; the renderer registers
none of its commands. A container of a kind that is off, or of a kind the desktop does not know, is a placeholder: the
engine loads it into `Project.unsupported` and saves it untouched (ADR-0017), and the desktop shows a dimmed row that
says why and offers nothing else. A restored tab of a kind that is off opens a placeholder panel, and History and the
HTTP Log offer no re-send or open for its entries. What a kind keeps for the whole project goes with it: REST's
webhook collection and SOAP's WS-Security configurations show as switched off and stay on disk untouched, and main
refuses any change, folder change or host call through a kind that is off with `feature-disabled`.

**`@internal`.** As with the protocol modules and the areas, the contract is composed statically in this repository.
Nothing loads third-party code, and the interface may change in any release.

## Consequences

- A new kind is a shared module, a main folder and a renderer folder, plus its place in the three lists. The channel
  names are pinned by a test, so moving a kind's code cannot rename a channel.
- `ProjectWire` keeps its per-kind fields: the renderer's stores read them by name, and the change stops at main.
- The registry is passed, never set: the engine keeps no process-wide state, so a test or another host in the same
  process cannot pick up the desktop's switches. A copy or export keeps the built-in registry on purpose, so it carries
  every kind the folder holds.
- The switch is read from the environment only. Settings and team policy replace it in phase 4.
- The typed preview entry points (`request.restPreview` and the like) still ask for their own kind by name.

## Alternatives considered

- **Keep the branches and add one per kind.** Rejected: it is what made a fifth kind an edit to every one of those
  files, and it gives no way to leave a kind out.
- **A replaceable process-wide default registry in the engine.** Tried first and removed: it acted at a distance on
  every call that passed none (importers, contract tools, mock recording), leaked between tests sharing a worker, and
  worked only if set before the first load. The registry is passed explicitly instead.
- **One module per kind holding all three halves.** Rejected: the renderer must not load main-only code, and the
  eager-import guard keeps zod out of its first load, so the halves stay apart.
