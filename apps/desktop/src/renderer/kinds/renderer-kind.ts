/**
 * The renderer half of one protocol kind (kind modules spec §6.1). Looked up by `kind` beside the
 * shared half (`shared/kinds/kind-module.ts`).
 *
 * @internal Composed statically in `RENDERER_KINDS`; not yet a plugin API (ADR-0017).
 */
import type { KindId } from '../../shared/kinds/kind-module.js';
import type { TabContribution } from './tab-contribution.js';

export interface RendererKind {
  readonly kind: KindId;
  /** Its editor tab kinds: the request editor and the container's tab. */
  readonly tabs: readonly TabContribution[];
}
