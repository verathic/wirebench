# v3 collection fixtures

Folder-format (v3) collections for the importer's tests. No JSON Schema is published for the format,
so these reproduce the shapes seen in real exports in public repositories, with every value rewritten:

- headers, query parameters and variables as a list of `{key, value}` and as a `key: value` map;
- auth credentials as a list and as a map, and a definition holding several auths;
- every body type, examples and WebSocket messages under `.resources/<request>.resources/`;
- orders spaced in thousands, a millisecond-timestamp order, and a request with none;
- a path-backed script, one climbing out of the collection, and request kinds with no Wirebench
  equivalent.

`workspace/` is a whole workspace folder (`collections/`, `environments/`, `globals/`); `single/` is one
collection with neither a definition file nor folders.
