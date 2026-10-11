/** What a send masks of an API key, shared by the kinds' send steps (spec §5.5). */
import type { KeyMasks } from './kind-main.js';

/**
 * The masks of an API key in the query or a header: the one query parameter it may be configured to
 * travel in, so the URL is masked wherever it is logged even when the key is called something this
 * build has never heard of; and the header one, masked by name wherever the headers are shown.
 */
export function apiKeyMasks(auth: { readonly type: string; readonly in?: string; readonly name?: string }): KeyMasks {
  if (auth.type !== 'api-key' || auth.name === undefined) return {};
  return auth.in === 'query' ? { keyParams: [auth.name] } : auth.in === 'header' ? { keyHeaders: [auth.name] } : {};
}
