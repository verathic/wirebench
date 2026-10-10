/**
 * The renderer half of one protocol kind (kind modules spec §6.1). Looked up by `kind` beside the
 * shared half (`shared/kinds/kind-module.ts`).
 *
 * @internal Composed statically in `RENDERER_KINDS`; not yet a plugin API (ADR-0017).
 */
import type { ComponentType } from 'react';
import type { KindId } from '../../shared/kinds/kind-module.js';
import type { ExplorerMenuGroup } from '../features/explorer/menu-items.js';
import type { ExplorerNode, ExplorerNodeKind } from '../features/explorer/tree-nodes.js';
import type { PendingNodeDeletion } from '../state/ui.js';
import type { TabContribution } from './tab-contribution.js';

/** How the explorer treats one node kind a protocol kind owns. */
export interface ExplorerNodeRole {
  readonly icon?: ComponentType<{ size: number }>;
  /** The row's test id, where the names block fixes one. */
  readonly testId?: string;
  /** Drawn in the row's gutter in place of the icon: a request's method or shape. */
  readonly Gutter?: ComponentType<{ readonly node: ExplorerNode }>;
  /** A container row's kind badge: `REST`, `gRPC`, `WS`. */
  readonly badge?: string;
  /**
   * What one click does besides selecting the row: a request opens; an API opens its tab and folds,
   * since the tab is where its base URL and credentials live and the row is also the container the
   * user is about to expand. Unset, the row folds if it has children.
   */
  readonly click?: 'open' | 'open-and-fold';
  /** Whether the row can be dragged within its container. */
  readonly movable?: boolean;
  /** Whether rows can be dropped into this one. */
  readonly dropTarget?: boolean;
  /** Opens the row's tab: a click on a request, a double-click on anything, Enter. */
  open?(node: ExplorerNode): void;
  /** Commits an inline rename. Unset, the row cannot be renamed inline. */
  rename?(node: ExplorerNode, name: string): void;
  /** Asks to delete the row (the Delete key). */
  remove?(node: ExplorerNode): void;
  /** The row's right-click menu. */
  menu?(node: ExplorerNode): readonly ExplorerMenuGroup[];
}

/** A deletion the explorer's confirm dialog carries out, by the pending deletion's kind. */
export interface ExplorerDeletion {
  readonly title: string;
  remove(id: string): Promise<unknown>;
}

/** The explorer's view of a kind: its rows, and what its folders' menus offer. */
export interface KindExplorer {
  readonly nodes: Partial<Record<ExplorerNodeKind, ExplorerNodeRole>>;
  /** **New request** in one of the kind's APIs, or a folder in one. Unset for a kind with no folders. */
  readonly newRequestIn?: (apiId: string, folderId?: string) => void;
  /** **Import cURL…** into a folder: only a kind whose requests are HTTP requests offers it. */
  readonly importCurlIn?: (apiId: string, folderId?: string) => void;
  readonly deletions?: Partial<Record<PendingNodeDeletion['kind'], ExplorerDeletion>>;
}

export interface RendererKind {
  readonly kind: KindId;
  /** Its editor tab kinds: the request editor and the container's tab. */
  readonly tabs: readonly TabContribution[];
  readonly explorer: KindExplorer;
}
