# Postman Collection v3 import (YAML folders) — design

Issue #349 · milestone 5.1 · 2026-10-11

## Problem

The newest Postman collection format is not one JSON document but a folder tree of YAML files, one
file per request, kept in git. Wirebench reads v2.0/2.1 JSON only, so teams that moved to the folder
format cannot bring their collections across.

## The format, as exported

No JSON Schema is published. The shapes below are from the format's own documentation and from
public repositories holding real exports. The checked-in fixtures reproduce every variant listed
here, with the values rewritten.

```text
postman/                        workspace root (optional)
  collections/
    <collection>/               one collection
      .resources/definition.yaml           $kind: collection (also a folder's metadata)
      .resources/<req>.resources/examples/*.example.yaml
      .resources/<req>.resources/messages/*.message.yaml   (WebSocket)
      <req>.request.yaml                   $kind: http-request | grpc-request | websocket-request | …
      <folder>/.resources/definition.yaml
      <folder>/<req>.request.yaml
  environments/*.yaml           { name, values: [{ key, value, type, enabled }] }
  globals/*.yaml                same shape
```

The variants real exports use:

- `headers`, `queryParams` and `variables` are written either as a list of `{key, value, description?,
  disabled?}` or as a map of `key: value`.
- `auth` is `{type, credentials}`, where `credentials` is a list of `{key, value}` or a map. A
  definition may hold a list of auths (multi-auth), each with an `id`, a `name` and `rules`.
- `scripts` is a list of `{type, code, language}`. A request's `type` is `beforeRequest` or
  `afterResponse`. A definition's types are prefixed (`http:beforeRequest`, `grpc:beforeInvoke`, …).
- `order` is a number used only for comparison. It is spaced in thousands, or is a millisecond
  timestamp.
- `examples` and `messages` are a relative path to a folder under `.resources/`.

## Decisions

1. **Reuse the v2.1 pipeline for HTTP.** v3 → a v2.1-shaped document → `parsePostmanCollection` →
   `apiFromPostmanCollection`. Auth, bodies, `{{var}}` translation, the dynamic-variable report,
   scripts (imported switched off, collection → folder → request), credentials and variables all
   behave exactly as they do for v2.1, and they follow whatever #333, #334 and #335 change there.
2. **Examples** become `RestResponseExample`s, masked as every importer masks a recorded response.
   The v2.1 parser gains the standard `item.response[]`, which the converter fills, so v2.1 JSON
   collections' saved responses import as examples too.
3. **Request kinds.** `http-request` → REST. `grpc-request` → a gRPC API. `websocket-request` → a
   WebSocket API. When a collection holds more than one kind, each API is named `<collection>
   (gRPC)` or `<collection> (WebSocket)`, as the folder-collection importer names them.
   `graphql-request`, `socket.io-request`, `mqtt-request`, `mcp-request` and `llm-request` items are
   listed in the report as not mapped. An unknown `$kind` is listed as well.
4. **Report.** Every documented auth type and body type is either mapped or reported. Fields a
   request or definition carries that Wirebench does not read are listed per file. That covers
   `settings`, fields the format does not document, and a script type of another protocol.
5. **Order** comes from `order`: folders and requests are sorted together, with missing values
   last and the name breaking ties.
6. **Path-backed scripts.** A script entry with no `code` and a relative `src`, `path` or `file` is
   read from the collection's own files, resolved against the YAML file's folder. A path that is
   absolute, holds `\`, or climbs out of the collection's root is refused and reported. Nothing
   outside the files handed over is ever read.
7. **What can be picked** (owner, 2026-10-11):
   - A **folder**, through a new `Folder…` button in the Import… dialog or `wirebench import
     <dir>`.
   - A collection's `.resources/definition.yaml`, which stands for the folder above `.resources`.
   - A **workspace root** (a folder with `collections/`, or a folder named `collections`): every
     collection under it is imported, each as its own API or APIs. `environments/*.yaml` become
     workspace environments, never activated, and `globals/*.yaml` merge into Globals.
8. **CLI secrets** (owner): `wirebench import` has no secret store. Plain variables become project
   properties, and a name the project already has keeps its value. Secret-typed variables are left
   out and named in the report. Environments are reported as not imported by the CLI.
9. **Detection.** `detectImportFormat` reports `postman-v3` for a document whose `$kind` is one of
   the format's kinds, and for a `…/.resources/definition.yaml` or `*.request.yaml` file name. A
   picked folder is always read as this format. A single request file alone is refused, with a
   message saying to pick its collection folder.

## Safety

The reader is pure: it takes a map of root-relative POSIX paths to text. Walking a folder belongs to
the hosts:

- **Desktop.** The root must pass `checkedImportSource` (picked, or inside an open project). The
  walk follows no symbolic links, keeps every entry inside the root's real path, opens files with
  no-follow, and stops at 5000 files, depth 64, 50 MB and 50 000 entries. That is the
  folder-collection walk, with `*.js` added for path-backed scripts. `node_modules` and `.git` are
  skipped.
- **CLI.** The same limits and no-follow rules, rooted at the path the user typed.

YAML is parsed with `yaml`'s defaults: no custom tags, and the alias-count guard is on. No regex
runs on unbounded input with nested quantifiers. Names are split with `lastIndexOf` and `endsWith`.

## Out of scope

- Running scripts and resolving dynamic variables (#333, #334, #335).
- Exporting to v3.
- Socket.IO, MQTT, MCP and LLM requests, which have no Wirebench equivalent.
