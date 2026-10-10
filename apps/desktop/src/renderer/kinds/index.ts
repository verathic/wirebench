/**
 * The renderer's kinds and its tab table (kind modules spec §6).
 */
import { GENERIC_TABS } from './generic-tabs.js';
import { grpcRenderer } from './grpc/index.js';
import { restRenderer } from './rest/index.js';
import type { RendererKind } from './renderer-kind.js';
import { soapRenderer } from './soap/index.js';
import type { TabContribution } from './tab-contribution.js';
import { wsRenderer } from './ws/index.js';
import type { EditorTab } from '../state/editors.js';

/** Every renderer kind, in the explorer's tie-break order. */
export const RENDERER_KINDS: readonly RendererKind[] = [soapRenderer, restRenderer, grpcRenderer, wsRenderer];

/** Every tab kind that names an entity, by `EditorTab.kind`: the kinds' own, then the generic ones. */
export const TAB_KINDS: Readonly<Partial<Record<EditorTab['kind'], TabContribution>>> = Object.fromEntries(
  [...RENDERER_KINDS.flatMap((kind) => kind.tabs), ...GENERIC_TABS].map((tab) => [tab.kind, tab]),
);

export type { RendererKind } from './renderer-kind.js';
export type { TabContribution, TabTitleContext } from './tab-contribution.js';
export { entityIdOf } from './tab-contribution.js';
