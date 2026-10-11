import type { HistoryEntryWire } from '../../../shared/wire-types.js';
import { openRequestTab } from '../../features/request-editor/request-actions.js';
import { useExchangesStore } from '../../state/exchanges.js';
import { ipc } from '../../state/ipc-client.js';
import type { KindHistory, KindRequests, KindSearch } from '../renderer-kind.js';
import { revealSoapMatch } from './search.js';

export const soapRequests: KindRequests = {
  open: openRequestTab,
  exists: (requestId, project) => project.requests[requestId] !== undefined,
};

function SoapHistoryBadge({ entry, place }: { readonly entry: HistoryEntryWire; readonly place: 'row' | 'header' }) {
  return place === 'row' ? (
    <span data-testid="history-soap-version" className="w-12 shrink-0 text-fg-faint">
      {entry.soapVersion === 'none' ? 'SOAP' : `SOAP ${entry.soapVersion}`}
    </span>
  ) : (
    <span className="text-xs text-fg-faint">SOAP</span>
  );
}

export const soapHistory: KindHistory = {
  Badge: SoapHistoryBadge,
  canResend: () => true,
  resend: (id) => ipc().history.resend({ id }),
  current: (requestId) => {
    const current = useExchangesStore.getState().byRequest[requestId]?.exchange;
    return current === undefined ? undefined : { label: 'Current', body: current.response?.envelopeXml ?? '' };
  },
};

export const soapSearch: KindSearch = { reveal: revealSoapMatch };
