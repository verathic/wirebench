import { resolve } from 'node:path';
import { grpcApisOf, loadProject, restApisOf, wsApisOf } from '@wirebench/engine';
import { afterEach, describe, expect, it } from 'vitest';
import { runOp } from '../../../src/ops/context.js';
import { importOp } from '../../../src/ops/import.js';
import { emptyProject, removeTempDirs, updateProject } from './helpers.js';

afterEach(removeTempDirs);

const V3 = resolve(import.meta.dirname, '..', '..', '..', '..', '..', 'fixtures', 'postman-v3');

describe('op import: a folder (v3) collection', () => {
  it('adds every collection of a workspace folder as its APIs, and its plain variables as project properties', async () => {
    const fixture = await emptyProject();
    await updateProject(fixture.dir, (project) => ({ ...project, properties: { pageSize: '50' } }));
    const result = await runOp(importOp, { source: resolve(V3, 'workspace') }, fixture.base());

    expect(result.format).toBe('postman-v3');
    expect(result.added).toEqual([
      { kind: 'rest', name: 'Bookstore API', slug: 'Bookstore API', requests: 14 },
      { kind: 'grpc', name: 'Realtime (gRPC)', slug: 'Realtime (gRPC)', requests: 1 },
      { kind: 'websocket', name: 'Realtime (WebSocket)', slug: 'Realtime (WebSocket)', requests: 1 },
    ]);
    const { project } = await loadProject(fixture.dir);
    expect(restApisOf(project).map((api) => api.name)).toEqual(['Bookstore API']);
    expect(grpcApisOf(project).map((api) => api.name)).toEqual(['Realtime (gRPC)']);
    expect(wsApisOf(project).map((api) => api.name)).toEqual(['Realtime (WebSocket)']);
    expect(project.properties).toMatchObject({ pageSize: '50', adminUser: 'admin', grpcHost: 'grpc.example.com:443' });
    expect(project.disabledProperties).toContain('legacyFlag');

    const codes = result.problems.map((problem) => problem.code);
    expect(codes).toContain('property-kept');
    expect(codes).toContain('environments-not-imported');
    expect(result.problems.find((p) => p.code === 'property-kept')?.message).toContain('pageSize');
  });

  it('takes a collection definition file for its folder, and a name', async () => {
    const fixture = await emptyProject();
    const result = await runOp(
      importOp,
      { source: resolve(V3, 'workspace/collections/Bookstore API/.resources/definition.yaml'), name: 'Books' },
      fixture.base(),
    );
    expect(result.added.map((item) => item.name)).toEqual(['Books']);
  });

  it('refuses a request file alone, naming the fix', async () => {
    const fixture = await emptyProject();
    const error: unknown = await runOp(
      importOp,
      { source: resolve(V3, 'single/Health.request.yaml') },
      fixture.base(),
    ).then(
      () => undefined,
      (failure: unknown) => failure,
    );
    expect(error).toMatchObject({ code: 'unsupported-format' });
    expect(error instanceof Error ? error.message : '').toContain('import its folder');
  });
});
