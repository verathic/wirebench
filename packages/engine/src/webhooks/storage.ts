/**
 * The webhook collection on disk (spec §3): `webhooks/webhooks.yaml` and the request tree under
 * `webhooks/requests/`, laid out as an API's is. REST's project-level files: they are read and
 * written only while REST is on, and with it off they are left on disk as they are.
 */
import type { ProtocolProjectFiles } from '../protocol/module.js';
import { readFileIfExists } from '../project/fs.js';
import { authConfig, loadFolderContents, optional, readYaml } from '../project/load-helpers.js';
import { listApiTreeFiles, toAbsolute } from '../project/managed-files.js';
import { REQUESTS_DIR, WEBHOOKS_DIR, WEBHOOKS_FILE } from '../project/paths.js';
import { locateInTree } from '../project/request-tree.js';
import { parseFile } from '../project/schema-parts.js';
import { addFolderFiles, authDocument } from '../project/serialize-helpers.js';
import { compact, stringifyYaml } from '../project/yaml.js';
import type { RestRequestDef } from '../rest/model.js';
import { restRequestReader, signingDocument, signingOf, writeRestRequest } from '../rest/storage.js';
import type { WebhookFolder } from './model.js';
import { webhooksOf, withWebhooks } from './model.js';
import { webhookFolderFileSchema, webhooksFileSchema } from './schema.js';

const COLLECTION_FILE = `${WEBHOOKS_DIR}/${WEBHOOKS_FILE}`;
const TREE_DIR = `${WEBHOOKS_DIR}/${REQUESTS_DIR}`;

/** REST's project-level files: the webhook collection. */
export const webhookProjectFiles: ProtocolProjectFiles = {
  /** Reads `webhooks/`; the project is returned as it is when there is no `webhooks.yaml`. */
  async load({ fs, root, problems }, project) {
    const document = await readYaml(fs, root, COLLECTION_FILE);
    if (document === undefined) return project;
    const parsed = parseFile(webhooksFileSchema, document, COLLECTION_FILE);
    const contents = await loadFolderContents(
      fs,
      root,
      TREE_DIR,
      0,
      problems,
      restRequestReader(fs, root, problems),
      (folderDocument, folderFile) => {
        if (folderDocument === undefined) return {};
        const folder = parseFile(webhookFolderFileSchema, folderDocument, folderFile);
        return {
          ...optional('target', folder.target),
          ...(folder.source !== undefined ? { source: { apiId: folder.source.apiId } } : {}),
          ...(folder.signing !== undefined ? { signing: signingOf(folder.signing) } : {}),
        };
      },
    );
    return withWebhooks(project, {
      target: parsed.target,
      ...(parsed.auth !== undefined ? { auth: authConfig(parsed.auth) } : {}),
      ...(parsed.signing !== undefined ? { signing: signingOf(parsed.signing) } : {}),
      folders: contents.folders as unknown as WebhookFolder[],
      requests: contents.requests,
    });
  },

  /** `webhooks/webhooks.yaml` and the request tree under it; nothing when the project has no collection. */
  files(project) {
    const files = new Map<string, string>();
    const webhooks = webhooksOf(project);
    if (webhooks === undefined) return files;
    files.set(
      COLLECTION_FILE,
      stringifyYaml(
        compact({
          target: webhooks.target,
          auth: webhooks.auth === undefined ? undefined : authDocument(webhooks.auth),
          signing: signingDocument(webhooks.signing),
        }),
      ),
    );
    addFolderFiles<RestRequestDef>(files, TREE_DIR, webhooks, 0, writeRestRequest, (folder) => {
      const hook = folder as Partial<WebhookFolder>;
      return {
        target: hook.target,
        source: hook.source === undefined ? undefined : { apiId: hook.source.apiId },
        signing: signingDocument(hook.signing),
      };
    });
    return files;
  },

  /** The request tree is managed only beside its `webhooks.yaml`, as an API's is beside its `api.yaml`. */
  async managed(fs, root) {
    if ((await readFileIfExists(fs, toAbsolute(root, COLLECTION_FILE))) === undefined) return [];
    return [COLLECTION_FILE, ...(await listApiTreeFiles(fs, root, TREE_DIR))];
  },

  requestLocation(project, requestId) {
    const webhooks = webhooksOf(project);
    return webhooks === undefined ? undefined : locateInTree(webhooks, TREE_DIR, requestId);
  },
};
