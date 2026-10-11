import { describe, expect, it } from 'vitest';
import type { V3Folder, V3Request } from '../../../../src/import/collection-v3/model.js';
import { readCollectionV3, resolveInside, v3Requests } from '../../../../src/import/collection-v3/parse.js';
import { fixtureFiles } from './fixture-files.js';

const names = (folder: V3Folder): string[] => folder.children.map((child) => child.name);
const folderNamed = (folder: V3Folder, name: string): V3Folder =>
  folder.children.find((child): child is V3Folder => child.type === 'folder' && child.name === name)!;
const requestNamed = (folder: V3Folder, name: string): V3Request =>
  v3Requests(folder).find((request) => request.name === name)!;

describe('readCollectionV3: layout', () => {
  it('reads a workspace folder: each folder under collections/ a collection, with environments and globals', () => {
    const read = readCollectionV3(fixtureFiles('workspace'), 'postman');
    expect(read.collections.map((c) => c.name)).toEqual(['Bookstore API', 'Realtime']);
    expect(read.collections.map((c) => c.path)).toEqual(['collections/Bookstore API', 'collections/Realtime']);
    expect(read.environments.map((f) => f.path)).toEqual(['environments/Local.environment.yaml']);
    expect(read.globals.map((f) => f.path)).toEqual(['globals/workspace.globals.yaml']);
  });

  it('reads a picked collection folder as one collection, named after the folder without a definition', () => {
    const read = readCollectionV3(fixtureFiles('single'), 'Status checks');
    expect(read.collections).toHaveLength(1);
    expect(read.collections[0]?.name).toBe('Status checks');
    expect(read.environments).toEqual([]);
  });

  it('reads a folder named collections as a list of collections', () => {
    const files = new Map(
      [...fixtureFiles('workspace')]
        .filter(([key]) => key.startsWith('collections/'))
        .map(([key, text]) => [key.slice('collections/'.length), text] as const),
    );
    const read = readCollectionV3(files, 'collections');
    expect(read.collections.map((c) => c.name)).toEqual(['Bookstore API', 'Realtime']);
  });

  it('finds no collection in a folder holding none', () => {
    expect(readCollectionV3(new Map([['notes.yaml', 'a: 1']]), 'stuff').collections).toEqual([]);
  });
});

describe('readCollectionV3: a collection', () => {
  const read = readCollectionV3(fixtureFiles('workspace'), 'postman');
  const bookstore = read.collections[0]!;

  it('orders folders and requests together by order, missing last, timestamps as numbers', () => {
    expect(names(bookstore)).toEqual(['Get all books', 'Get book by :id', 'Add book', 'Admin', 'Legacy']);
    expect(names(folderNamed(bookstore, 'Legacy'))).toEqual(['Ping', 'Health']);
  });

  it('names a request by its name field, else its file name', () => {
    expect(requestNamed(bookstore, 'Get book by :id').path).toBe(
      'collections/Bookstore API/Get book by id.request.yaml',
    );
    expect(requestNamed(bookstore, 'Add book').kind).toBe('http-request');
  });

  it('reads the collection and folder definitions and their scripts', () => {
    expect(bookstore.definition?.['description']).toBe('Books, authors and the admin area.');
    expect(bookstore.scripts.map((s) => s.type)).toEqual(['http:beforeRequest', 'grpc:beforeInvoke']);
    expect(folderNamed(bookstore, 'Admin').definition?.['order']).toBe(4000);
  });

  it('collects examples from the folder the request names, by order', () => {
    const examples = requestNamed(bookstore, 'Get all books').examples;
    expect(examples.map((e) => e.path.split('/').pop())).toEqual(['200 OK.example.yaml', '500.example.yaml']);
  });

  it('reads a path-backed script from the collection and refuses one outside it', () => {
    const audit = requestNamed(bookstore, 'Audit');
    expect(audit.scripts).toEqual([
      { type: 'beforeRequest', code: "pm.request.headers.add({ key: 'X-Signed', value: 'yes' });\n" },
    ]);
    expect(read.report.warnings).toContain(
      'collections/Bookstore API/Admin/Audit.request.yaml: the script file "../../../../outside.js" is outside the collection, so it was not read.',
    );
  });

  it('collects WebSocket messages from the default folder beside the request', () => {
    const chat = requestNamed(read.collections[1]!, 'Chat');
    expect(chat.messages.map((m) => m.doc['content'])).toEqual(['{ "type": "hello", "user": "{{userName}}" }', 'bye']);
  });
});

describe('readCollectionV3: hostile and broken input', () => {
  it('skips keys that are not plain paths inside the folder', () => {
    const read = readCollectionV3(
      new Map([
        ['../escape.request.yaml', '$kind: http-request'],
        ['/abs.request.yaml', '$kind: http-request'],
        ['a\\b.request.yaml', '$kind: http-request'],
        ['ok.request.yaml', '$kind: http-request\nurl: https://x.example'],
      ]),
      'c',
    );
    expect(v3Requests(read.collections[0]!).map((r) => r.name)).toEqual(['ok']);
    expect(read.report.warnings).toHaveLength(3);
  });

  it('reports a file that is not YAML, not a mapping, or has no $kind, and keeps the rest', () => {
    const read = readCollectionV3(
      new Map([
        ['bad.request.yaml', 'url: [unclosed'],
        ['list.request.yaml', '- 1\n- 2'],
        ['nokind.request.yaml', 'url: https://x.example'],
        ['good.request.yaml', '$kind: http-request'],
      ]),
      'c',
    );
    expect(v3Requests(read.collections[0]!).map((r) => r.name)).toEqual(['good']);
    expect(read.report.warnings).toEqual([
      'bad.request.yaml: not valid YAML, so it was skipped.',
      'list.request.yaml: not a YAML mapping, so it was skipped.',
      'nokind.request.yaml: it has no $kind, so it was skipped.',
    ]);
  });

  it('refuses an examples folder outside the collection', () => {
    const read = readCollectionV3(
      new Map([
        ['collections/A/r.request.yaml', '$kind: http-request\nexamples: ../B/.resources/x'],
        ['collections/B/.resources/x/leak.example.yaml', '$kind: http-example'],
        ['collections/B/s.request.yaml', '$kind: http-request'],
      ]),
      'postman',
    );
    expect(read.collections[0]?.children[0]).toMatchObject({ name: 'r', examples: [] });
    expect(read.report.warnings).toContain(
      'collections/A/r.request.yaml: its examples folder "../B/.resources/x" is outside the collection, so it was not read.',
    );
  });

  it('skips files nested deeper than the limit', () => {
    const deep = `${Array.from({ length: 70 }, (_, i) => `d${String(i)}`).join('/')}/r.request.yaml`;
    const read = readCollectionV3(
      new Map([
        [deep, '$kind: http-request'],
        ['top.request.yaml', '$kind: http-request'],
      ]),
      'c',
    );
    expect(v3Requests(read.collections[0]!).map((r) => r.name)).toEqual(['top']);
  });

  it('does not expand a YAML alias bomb', () => {
    const bomb = ['a: &a [x, x, x, x, x, x, x, x, x, x]', 'b: &b [*a, *a, *a, *a, *a, *a, *a, *a, *a, *a]'];
    for (let i = 0; i < 8; i += 1) {
      const from = String.fromCharCode(98 + i);
      const to = String.fromCharCode(99 + i);
      bomb.push(`${to}: &${to} [${Array(10).fill(`*${from}`).join(', ')}]`);
    }
    bomb.push('$kind: http-request');
    const read = readCollectionV3(new Map([['bomb.request.yaml', bomb.join('\n')]]), 'c');
    expect(v3Requests(read.collections[0]!)).toEqual([]);
    expect(read.report.warnings).toEqual(['bomb.request.yaml: not valid YAML, so it was skipped.']);
  });
});

describe('resolveInside', () => {
  it('resolves relative paths and keeps them inside the root', () => {
    expect(resolveInside('c', 'c/f', './x.js')).toBe('c/f/x.js');
    expect(resolveInside('c', 'c/f', '../x.js')).toBe('c/x.js');
    expect(resolveInside('c', 'c/f', '../../x.js')).toBeUndefined();
    expect(resolveInside('', '', '../x.js')).toBeUndefined();
    expect(resolveInside('', 'f', 'a//b/./c')).toBe('f/a/b/c');
  });

  it('refuses absolute paths, drive letters, backslashes and NUL', () => {
    for (const path of ['/etc/passwd', 'C:/x', 'c:\\x', 'a\\b', 'a\u0000b', '']) {
      expect(resolveInside('', '', path)).toBeUndefined();
    }
  });
});

describe('readCollectionV3: scale', () => {
  it('reads a collection at the file limit in one pass over the paths, not one per folder', () => {
    const files = new Map<string, string>();
    for (let folder = 0; folder < 1000; folder += 1) {
      const dir = `f${String(folder % 10)}/g${String(folder)}`;
      files.set(`${dir}/.resources/definition.yaml`, `$kind: collection\norder: ${String(folder)}`);
      for (let n = 0; n < 4; n += 1) files.set(`${dir}/r${String(n)}.request.yaml`, '$kind: http-request');
    }
    const started = performance.now();
    const read = readCollectionV3(files, 'big');
    const elapsed = performance.now() - started;
    expect(read.collections[0]?.name).toBe('big');
    expect(v3Requests(read.collections[0]!)).toHaveLength(4000);
    expect(elapsed).toBeLessThan(3000);
  });
});
