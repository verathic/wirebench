/**
 * Per-workspace editor tabs: saved when a workspace closes, restored when it opens again.
 *
 * Only the tab kinds that name a durable entity survive a switch — a request of either protocol,
 * an imported interface, an API, an environment, a project. A diff, a history entry and the
 * preferences tab all describe a moment rather than a thing, so they are simply dropped.
 */

import { entityIdOf, TAB_KINDS, tabOwner, type TabContribution } from '../kinds/index.js';
import { kindLabel } from '../kinds/placeholders.js';
import type { PersistedTab } from './ui-state.js';
import { useEditorsStore, type EditorTab } from './editors.js';
import { useProjectStore } from './project.js';
import { useUiStore } from './ui.js';
import { useWorkspaceStore } from './workspace.js';

/** The contribution of a tab kind that survives a workspace switch. */
function persistedContribution(kind: EditorTab['kind']): TabContribution | undefined {
  const contribution = TAB_KINDS[kind];
  return contribution?.persisted === true ? contribution : undefined;
}

/** The persisted shape of an open tab, or `undefined` for a kind that does not survive. */
function persist(tab: EditorTab): PersistedTab | undefined {
  const contribution = persistedContribution(tab.kind);
  const id = contribution === undefined ? undefined : entityIdOf(tab, contribution);
  return id === undefined ? undefined : { kind: tab.kind as PersistedTab['kind'], id };
}

/** The title one persisted tab reopens with, or `undefined` when its entity is gone. */
function titleFor(contribution: TabContribution, id: string): string | undefined {
  return contribution.title(id, {
    project: useProjectStore.getState(),
    workspaceEnvironments: useWorkspaceStore.getState().workspace?.environments ?? [],
    hookNames: {},
  });
}

/**
 * Records the open tabs and the sidebar view of `workspaceId`. Called just before a workspace
 * is replaced or closed, while the editors store still holds its tabs.
 */
export function saveWorkspaceTabs(workspaceId: string): void {
  const { tabs, activeId } = useEditorsStore.getState();
  const persisted = tabs.map(persist).filter((tab): tab is PersistedTab => tab !== undefined);
  const active = tabs.find((tab) => tab.id === activeId);
  const activeEntity = active === undefined ? undefined : persist(active);
  // The explorer's fold state is written as it changes, not here; carry it over untouched.
  const explorerOpen = useUiStore.getState().workspaces[workspaceId]?.explorerOpen;
  useUiStore.getState().setWorkspaceUi(workspaceId, {
    tabs: persisted,
    ...(activeEntity === undefined ? {} : { activeId: activeEntity.id }),
    sidebarView: useUiStore.getState().sidebar.view,
    ...(explorerOpen === undefined ? {} : { explorerOpen }),
  });
}

/**
 * Reopens what {@link saveWorkspaceTabs} recorded for `workspaceId`, dropping every tab whose
 * entity the project mirror no longer resolves — a request deleted, an interface removed, a
 * project unlinked between two sessions. Must run after the mirror is filled.
 */
export function restoreWorkspaceTabs(workspaceId: string): void {
  const entry = useUiStore.getState().workspaces[workspaceId];
  if (entry === undefined) {
    return;
  }
  const editors = useEditorsStore.getState();
  let activeTabId: string | undefined;
  const enabledKinds = useUiStore.getState().enabledKinds;
  for (const tab of entry.tabs) {
    const contribution = persistedContribution(tab.kind);
    // A tab of a kind this run switched off reopens as a placeholder panel rather than vanishing: its
    // entity is not in the mirror, so it is named for its kind.
    const owner = tabOwner(tab.kind);
    const off = owner !== undefined && !enabledKinds.includes(owner);
    const title = contribution === undefined ? undefined : off ? kindLabel(owner) : titleFor(contribution, tab.id);
    if (contribution === undefined || title === undefined) {
      continue;
    }
    const id = `${contribution.prefix}${tab.id}`;
    editors.open({ id, kind: tab.kind, title, [contribution.idField]: tab.id });
    if (tab.id === entry.activeId) {
      activeTabId = id;
    }
  }
  // `open` activates whatever it opened last, so the remembered tab is selected afterwards;
  // with none remembered (or resolvable) the Start tab shows instead.
  if (activeTabId === undefined) {
    useEditorsStore.getState().showStart();
  } else {
    useEditorsStore.getState().activate(activeTabId);
  }
  if (entry.sidebarView !== undefined) {
    useUiStore.getState().setSidebarView(entry.sidebarView);
  }
}

/**
 * Records the *open* workspace's tabs, for the one moment {@link saveWorkspaceTabs} never
 * sees: the window going away.
 *
 * Tabs are otherwise written only when a workspace is left for another one, because that is
 * the only point at which the outgoing workspace's tabs are still on screen. Quitting is the
 * exception — nothing is "left", the renderer simply stops — so without this a relaunch would
 * reopen the last workspace with no tabs at all, which the app promises it does not.
 */
export function rememberOpenWorkspaceTabs(): void {
  const workspaceId = useWorkspaceStore.getState().workspace?.id;
  if (workspaceId !== undefined) {
    saveWorkspaceTabs(workspaceId);
  }
}
