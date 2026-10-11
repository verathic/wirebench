/**
 * Reading a folder (v3) collection from disk for the hosts: the CLI, and the desktop once it has
 * checked the picked path. The walk follows no symbolic link — a file or a folder — keeps every
 * entry inside the root's real path, opens each file with no-follow, and stops at
 * {@link COLLECTION_V3_FOLDER_LIMITS}. Only `*.yaml`, `*.yml` and `*.js` files are read; `.git` and
 * `node_modules` are skipped.
 */

import { constants } from 'node:fs';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import { basename, dirname, join, relative, sep } from 'node:path';
import { PostmanError } from '../../errors.js';
import type { MapCollectionV3Options, MappedCollectionV3 } from './map.js';
import { mapCollectionV3 } from './map.js';
import { readCollectionV3 } from './parse.js';

/** The limits of one folder walk. */
export interface CollectionV3FolderLimits {
  /** Files read. */
  readonly files: number;
  /** Folders deep below the root. */
  readonly depth: number;
  /** Bytes of the files read, together. */
  readonly bytes: number;
  /** Folder entries looked at, of any kind. */
  readonly entries: number;
}

export const COLLECTION_V3_FOLDER_LIMITS: CollectionV3FolderLimits = {
  files: 5000,
  depth: 64,
  bytes: 50 * 1024 * 1024,
  entries: 50_000,
};

const READ_FILE = /\.(?:ya?ml|js)$/i;
const SKIPPED_FOLDERS = new Set(['node_modules', '.git']);
const DEFINITION_FILE = /^definition\.ya?ml$/i;
const REQUEST_FILE = /\.request\.ya?ml$/i;

function readFailed(path: string, error: unknown): PostmanError {
  return new PostmanError(
    'postman-read-failed',
    `Failed to read the collection at "${path}": ${error instanceof Error ? error.message : String(error)}`,
    { cause: error },
  );
}

function inside(base: string, path: string): boolean {
  return path === base || path.startsWith(base.endsWith(sep) ? base : `${base}${sep}`);
}

/**
 * The folder a picked path stands for: a folder is itself; a collection's
 * `.resources/definition.yaml` is the folder above `.resources`. A request file alone is refused:
 * the collection is its folder.
 *
 * @throws PostmanError `postman-v3-pick-folder` for a request file, `postman-v3-not-a-collection`
 *   for any other file, `postman-read-failed` when the path cannot be looked at
 */
export async function collectionV3Root(path: string): Promise<string> {
  let info;
  try {
    info = await lstat(path);
  } catch (error) {
    throw readFailed(path, error);
  }
  if (info.isDirectory()) return path;
  const name = basename(path);
  if (DEFINITION_FILE.test(name) && basename(dirname(path)) === '.resources') return dirname(dirname(path));
  if (REQUEST_FILE.test(name)) {
    throw new PostmanError(
      'postman-v3-pick-folder',
      'This is one request of a folder collection: pick the collection folder (or its .resources/definition.yaml) instead.',
    );
  }
  throw new PostmanError(
    'postman-v3-not-a-collection',
    'Pick a folder collection: its folder, or its .resources/definition.yaml.',
  );
}

/** One file's text, opened without following a link, refused past the bytes left. */
async function readNoFollow(path: string, budget: number, limit: number): Promise<string | undefined> {
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)).catch(() => undefined);
  if (handle === undefined) return undefined;
  try {
    const info = await handle.stat();
    if (!info.isFile()) return undefined;
    if (info.size > budget) {
      throw new PostmanError('postman-too-large', `The collection is larger than ${String(limit / (1024 * 1024))} MB`);
    }
    return await handle.readFile({ encoding: 'utf8' });
  } finally {
    await handle.close();
  }
}

/**
 * Every `*.yaml`, `*.yml` and `*.js` under `root`, keyed by POSIX path relative to it. `root` must be
 * a folder and not a link. `limits` exists for tests.
 *
 * @throws PostmanError `postman-v3-not-a-folder`, `postman-v3-too-many-files` (files or entries),
 *   `postman-v3-too-deep`, `postman-too-large`, `postman-read-failed`
 */
export async function readCollectionV3Folder(
  root: string,
  limits: CollectionV3FolderLimits = COLLECTION_V3_FOLDER_LIMITS,
): Promise<Map<string, string>> {
  let info;
  try {
    info = await lstat(root);
  } catch (error) {
    throw readFailed(root, error);
  }
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new PostmanError('postman-v3-not-a-folder', `"${root}" is not a folder (a linked folder is not followed)`);
  }
  try {
    return await walk(root, limits);
  } catch (error) {
    if (error instanceof PostmanError) throw error;
    throw readFailed(root, error);
  }
}

async function walk(base: string, limits: CollectionV3FolderLimits): Promise<Map<string, string>> {
  const realBase = await realpath(base);
  const files = new Map<string, string>();
  let bytes = 0;
  let entriesSeen = 0;
  const tooMany = (): PostmanError =>
    new PostmanError('postman-v3-too-many-files', `The collection holds more than ${String(limits.files)} files`);
  const queue: { dir: string; depth: number }[] = [{ dir: base, depth: 0 }];
  for (let at = 0; at < queue.length; at += 1) {
    const { dir, depth } = queue[at]!;
    if (depth > limits.depth) {
      throw new PostmanError(
        'postman-v3-too-deep',
        `The collection is nested more than ${String(limits.depth)} folders deep`,
      );
    }
    const entries = await readdir(dir, { withFileTypes: true });
    entriesSeen += entries.length;
    if (entriesSeen > limits.entries) throw tooMany();
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const dirent of entries) {
      if (dirent.isSymbolicLink()) continue;
      const path = join(dir, dirent.name);
      const isFile = dirent.isFile() && READ_FILE.test(dirent.name);
      const isFolder = dirent.isDirectory() && !SKIPPED_FOLDERS.has(dirent.name);
      if (!isFile && !isFolder) continue;
      if (isFile && files.size >= limits.files) throw tooMany();
      // A folder mounted or swapped in under the root would leave it without being a link.
      const real = await realpath(path).catch(() => undefined);
      if (real === undefined || !inside(realBase, real)) continue;
      if (isFolder) {
        queue.push({ dir: path, depth: depth + 1 });
        continue;
      }
      const text = await readNoFollow(path, limits.bytes - bytes, limits.bytes);
      if (text === undefined) continue;
      bytes += Buffer.byteLength(text, 'utf8');
      files.set(relative(base, path).split(sep).join('/'), text);
    }
  }
  return files;
}

/**
 * Reads and maps the folder collection a picked path stands for (see {@link collectionV3Root}).
 * The picked folder's name names a collection that has no definition.
 */
export async function importCollectionV3Folder(
  path: string,
  options: MapCollectionV3Options = {},
): Promise<MappedCollectionV3> {
  const root = await collectionV3Root(path);
  const files = await readCollectionV3Folder(root);
  return mapCollectionV3(readCollectionV3(files, basename(root)), options);
}
