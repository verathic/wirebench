/**
 * REST's share of `search.query` (spec §5.4): the documents its requests add to the corpus.
 */
import type { SearchDocument } from '../../search.js';
import type { KindSearch } from '../kind-main.js';

export const restSearch: KindSearch = {
  requests({ snapshot, scopes, projectId, projectName }) {
    const documents: SearchDocument[] = [];
    // A REST request's searchable text is its URL, its tables and its body — the three places a
    // user looks for "which request talks to /orders". The API's name takes the interface name's slot
    // so a match reads the same way in the results list whichever protocol it came from.
    for (const request of snapshot.restRequests) {
      const apiName = snapshot.apis.find((api) => api.id === request.apiId)?.name ?? request.apiId;
      if (scopes.requestBodies) {
        const body = request.body;
        const lines = [`${request.method} ${request.url}`];
        for (const row of [...request.pathParams, ...request.query]) {
          lines.push(`${row.name}=${row.value}`);
        }
        if (body.kind === 'raw') {
          lines.push(body.text);
        } else if (body.kind === 'form') {
          for (const field of body.fields) {
            lines.push(`${field.name}=${field.value}`);
          }
        }
        documents.push({
          kind: 'request-body',
          protocol: 'rest',
          text: lines.join('\n'),
          projectId,
          projectName,
          requestId: request.id,
          requestName: request.name,
          interfaceId: request.apiId,
          interfaceName: apiName,
        });
      }
      if (scopes.headers && request.headers.length > 0) {
        documents.push({
          kind: 'request-header',
          protocol: 'rest',
          text: request.headers.map((header) => `${header.name}: ${header.value}`).join('\n'),
          projectId,
          projectName,
          requestId: request.id,
          requestName: request.name,
          interfaceId: request.apiId,
          interfaceName: apiName,
        });
      }
    }
    return documents;
  },
};
