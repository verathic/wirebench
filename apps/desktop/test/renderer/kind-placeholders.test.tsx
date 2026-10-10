/**
 * Kind modules spec §7.2: a container of a kind that is off, or unknown, is a placeholder row that
 * says why; a restored tab of a kind that is off is a placeholder panel; and History, the HTTP Log
 * and the command palette offer nothing for a kind that is off.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { registerShellCommands } from '../../src/renderer/commands/register-shell-commands.js';
import { rowActions, type RequestLookup } from '../../src/renderer/features/console/log-row-actions.js';
import { explorerMenuItems } from '../../src/renderer/features/explorer/context-menu.js';
import { buildExplorerTree } from '../../src/renderer/features/explorer/tree-nodes.js';
import { canResendHistoryEntry } from '../../src/renderer/features/history/history-actions.js';
import { getCommand, resetCommands } from '../../src/renderer/lib/commands.js';
import { EditorArea } from '../../src/renderer/shell/editor-area.js';
import { useEditorsStore } from '../../src/renderer/state/editors.js';
import { useProjectStore } from '../../src/renderer/state/project.js';
import { DEFAULT_UI_STATE } from '../../src/renderer/state/ui-state.js';
import { useUiStore } from '../../src/renderer/state/ui.js';
import { restoreWorkspaceTabs } from '../../src/renderer/state/workspace-tabs.js';
import { useWorkspaceStore } from '../../src/renderer/state/workspace.js';
import { logExchange, makeGrpcExchange } from '../mocks/exchange-fixtures.js';
import { installWirebenchApi } from '../mocks/wirebench-api.js';
import { restApiWire } from '../helpers/wire-defaults.js';

vi.mock('@monaco-editor/react', async () => await import('../mocks/monaco-editor-react.js'));
vi.mock('../../src/renderer/editor/monaco.js', async () => await import('../mocks/monaco-runtime.js'));

const PROJECT = { id: 'p1', name: 'Shop', source: 'internal', dir: '/p1', status: 'ready' } as const;

beforeEach(() => {
  useUiStore.getState().setEnabledKinds(['soap', 'rest', 'websocket']);
});

afterEach(() => {
  cleanup();
  useUiStore.getState().setEnabledKinds(['soap', 'rest', 'grpc', 'websocket']);
  useEditorsStore.getState().reset();
  useProjectStore.getState().reset();
  resetCommands();
});

describe('a placeholder row', () => {
  const tree = () =>
    buildExplorerTree(
      [PROJECT],
      [{ projectId: 'p1', interfaceIds: [] }],
      {},
      [],
      {
        p1: {
          apis: [restApiWire({ id: 'a0', name: 'First', order: 0 }), restApiWire({ id: 'a2', name: 'Last', order: 2 })],
          folders: [],
          requests: [],
        },
      },
      undefined,
      {},
      {},
      {},
      undefined,
      {},
      {},
      {},
      {
        p1: [
          { dir: 'apis', slug: 'pets', kind: 'grpc', reason: 'feature-disabled', name: 'Pets', order: 1 },
          { dir: 'apis', slug: 'graph', kind: 'graphql', reason: 'unknown-kind' },
        ],
      },
    );

  it('sits at its order among the containers, named, saying why; one with no order goes last', () => {
    const children = tree()[0]?.children ?? [];
    expect(children.map((node) => [node.kind, node.label])).toEqual([
      ['api', 'First'],
      ['placeholder', 'Pets'],
      ['api', 'Last'],
      ['placeholder', 'graph'],
    ]);
    expect(children[1]).toMatchObject({ placeholderKind: 'grpc', message: 'gRPC is switched off' });
    expect(children[3]?.message).toBe('This project uses a kind this version of Wirebench does not know (graphql)');
    expect(children[1]?.children).toBeUndefined();
  });

  it('offers only one menu item, which says why', () => {
    const placeholder = tree()[0]?.children?.[1];
    expect(placeholder).toBeDefined();
    if (placeholder === undefined) return;
    expect(explorerMenuItems(placeholder).map((item) => item.label)).toEqual(['gRPC is switched off']);
  });
});

describe('a restored tab of a kind that is off', () => {
  it('reopens as a placeholder panel rather than vanishing', () => {
    installWirebenchApi();
    useWorkspaceStore.setState({ workspace: null });
    useUiStore.setState({ workspaces: {}, sidebar: DEFAULT_UI_STATE.sidebar });
    useUiStore.getState().setWorkspaceUi('w1', { tabs: [{ kind: 'grpc-request', id: 'g1' }], activeId: 'g1' });

    restoreWorkspaceTabs('w1');
    expect(useEditorsStore.getState().tabs).toEqual([
      expect.objectContaining({ id: 'grpc:g1', kind: 'grpc-request', title: 'gRPC', grpcRequestId: 'g1' }),
    ]);

    render(<EditorArea />);
    expect(screen.getByTestId('editor-placeholder').textContent).toBe('gRPC is switched off');
  });
});

describe('an entry of a kind that is off', () => {
  it('cannot be re-sent from History', () => {
    expect(canResendHistoryEntry({ kind: 'grpc' })).toBe(false);
    expect(canResendHistoryEntry({ kind: 'rest' })).toBe(true);
  });

  it('cannot be re-sent or opened from the HTTP Log, and says why', () => {
    const lookup: RequestLookup = { has: () => true, unaryGrpc: () => true, enabled: (kind) => kind !== 'grpc' };
    const actions = rowActions(logExchange(makeGrpcExchange(), 'g1'), lookup);
    expect(actions.find((action) => action.id === 'resend')).toMatchObject({
      enabled: false,
      reason: 'gRPC is switched off',
    });
    expect(actions.find((action) => action.id === 'open-request')).toMatchObject({
      enabled: false,
      reason: 'gRPC is switched off',
    });
  });
});

describe('the commands of a kind that is off', () => {
  it('are not registered', () => {
    registerShellCommands(vi.fn());
    expect(getCommand('grpc.send')).toBeUndefined();
    expect(getCommand('rest.send')).toBeDefined();
  });
});
