# Postman Collection v3 import — plan

Spec: [2026-10-11-collection-v3-import-design.md](../specs/2026-10-11-collection-v3-import-design.md) ·
issue #349. One commit per task, each after
`NODE_OPTIONS=--max-old-space-size=8192 WIREBENCH_SKIP_PERF=1 pnpm check` is green.

## Task 1: v2.1 saved responses as examples

- `rest/postman`: `PostmanItem.response` is parsed from `item.response[]` (`name`, `code`, `status`,
  `header`, `body`). The mapper turns each entry with a numeric code into a masked
  `RestResponseExample`, using `maskRecordedResponse` and the 256 KB cut.
- Tests: an export with two responses gives two examples, a credential header is masked, an entry
  without a code is skipped and noted.

## Task 2: fixtures and the v3 reader

- `fixtures/postman-v3/`: a workspace root (`collections/` with two collections, plus
  `environments/` and `globals/`) and a single collection. Together they cover every variant in
  the spec: list and map forms, multi-auth, every body type, examples, WebSocket messages, a
  path-backed script, a gRPC request, the unmapped kinds, an unknown field, and timestamp orders.
- `engine/src/import/collection-v3/`:
  - `model.ts`: the limits and the result types.
  - `parse.ts`: files map → collections. This covers root detection, `.resources` handling, the
    sort by `order`, and the v2.1-shaped document for HTTP items, with gRPC and WebSocket items
    and the report alongside. Path resolution here is pure and refuses absolute paths, backslashes
    and climbs out of the root.
- Tests drive the reader with the fixture folders, read into a map, and with crafted maps for
  traversal and hostile input.

## Task 3: the v3 mapper and detection

- `map.ts`: collections → `{ rest?, grpc?, websocket? }` per collection, plus a variable plan
  (project properties per collection, environments, globals), counts and a report. HTTP goes
  through `parsePostmanCollection` and `apiFromPostmanCollection`. gRPC and WebSocket use
  `createGrpcRequest` and `createWsRequest`.
- `import-detect.ts`: the `postman-v3` kind, by `$kind` text and by file name.
- Tests: fixture → APIs, names, order, auth, bodies, examples, scripts switched off, the report
  lines, and detection.

## Task 4: reading a folder from disk (engine, Node), then the CLI

- `read-folder.ts`: a no-follow, contained, limited walk of `*.yaml`, `*.yml` and `*.js`.
- CLI `import`: a directory, or a `.resources/definition.yaml`, is read and mapped. APIs are added
  with unique slugs, and plain properties go into the project. Secret variables and environments
  are reported. Help text and the MCP tool description are updated.
- Tests: the walker (a link is skipped, a file outside the root is not read, limits), and the CLI
  op on the fixtures in a temp project.

## Task 5: desktop

- `opencollection-tree.ts`: the walk takes an include rule, and `readCollectionFolder` uses it for
  v3 (root checked by `checkedImportSource`, root not a link).
- `dialogs.openFolder` records a read pick. A new `api.importPostmanFolder` channel: the request is
  `{target, source: {kind: 'folder'|'file', path}}`, and the response is shaped like the
  folder-collection one plus environments. The handler places the REST, gRPC and WebSocket APIs
  and applies the variable plan.
- Import… dialog: a `Folder…` button, the `postman-v3` format, and a result summary.
- Tests: main handler unit tests with a temp folder, wire schema sync, and a dialog unit test.

## Task 6: docs and changelog

- `docs-site` importers guide, the CLI reference (`pnpm docs:commands`), and a CHANGELOG
  `[Unreleased]` entry.
