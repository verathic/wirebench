import type { InterfaceSummary, OperationSummaryWire } from '../../../shared/wire-types.js';
import type { ExplorerConflictTargets, ExplorerNode } from '../../features/explorer/tree-nodes.js';
import type { RequestDraft } from '../../state/project.js';
import type { KindExplorerTree } from '../explorer-tree.js';

function endpointsNode(interfaceId: string, summary: InterfaceSummary): ExplorerNode {
  const children: ExplorerNode[] = summary.services.flatMap((service) =>
    service.ports.map((port) => ({
      id: `endpoint:${interfaceId}:${service.name}:${port.name}`,
      kind: 'endpoint' as const,
      label: port.address !== undefined ? `${port.name} — ${port.address}` : port.name,
      ...(port.address !== undefined ? { address: port.address } : {}),
    })),
  );
  return { id: `endpoints:${interfaceId}`, kind: 'endpoints', label: 'Endpoints', children };
}

function requestNodes(
  interfaceId: string,
  operation: OperationSummaryWire,
  requests: readonly RequestDraft[],
  conflicted: ExplorerConflictTargets,
): ExplorerNode[] {
  return requests
    .filter(
      (r) => r.interfaceId === interfaceId && r.bindingName === operation.binding && r.operationName === operation.name,
    )
    .map((r) => ({
      id: `req:${r.id}`,
      kind: 'request' as const,
      label: r.name,
      requestId: r.id,
      ...(r.orphaned === true ? { orphaned: true } : {}),
      ...(conflicted.requestIds.has(r.id) ? { conflicted: true } : {}),
    }));
}

function operationNode(
  interfaceId: string,
  operation: OperationSummaryWire,
  requests: readonly RequestDraft[],
  conflicted: ExplorerConflictTargets,
): ExplorerNode {
  return {
    id: `op:${interfaceId}:${operation.binding}:${operation.name}`,
    kind: 'operation',
    label: operation.name,
    interfaceId,
    bindingName: operation.binding,
    operationName: operation.name,
    ...(operation.soapAction !== undefined ? { soapAction: operation.soapAction } : {}),
    children: requestNodes(interfaceId, operation, requests, conflicted),
  };
}

function sortedOperations(operations: readonly OperationSummaryWire[]): OperationSummaryWire[] {
  return [...operations].sort((a, b) => a.name.localeCompare(b.name));
}

function operationsNode(
  interfaceId: string,
  summary: InterfaceSummary,
  requests: readonly RequestDraft[],
  conflicted: ExplorerConflictTargets,
): ExplorerNode {
  const bindings = [...new Set(summary.operations.map((op) => op.binding))];

  if (bindings.length <= 1) {
    const children = sortedOperations(summary.operations).map((op) =>
      operationNode(interfaceId, op, requests, conflicted),
    );
    return { id: `operations:${interfaceId}`, kind: 'operations', label: 'Operations', children };
  }

  const children: ExplorerNode[] = bindings.map((binding) => {
    const bindingLocal = summary.operations.find((op) => op.binding === binding)?.bindingLocal ?? binding;
    const opsForBinding = sortedOperations(summary.operations.filter((op) => op.binding === binding));
    return {
      id: `binding:${interfaceId}:${binding}`,
      kind: 'binding' as const,
      label: bindingLocal,
      interfaceId,
      bindingName: binding,
      children: opsForBinding.map((op) => operationNode(interfaceId, op, requests, conflicted)),
    };
  });

  return { id: `operations:${interfaceId}`, kind: 'operations', label: 'Operations', children };
}

function interfaceNode(
  summary: InterfaceSummary,
  requests: readonly RequestDraft[],
  conflicted: ExplorerConflictTargets,
): ExplorerNode {
  return {
    id: `iface:${summary.id}`,
    kind: 'interface',
    label: summary.name,
    interfaceId: summary.id,
    ...(summary.problems.length > 0 ? { problemCount: summary.problems.length } : {}),
    children: [endpointsNode(summary.id, summary), operationsNode(summary.id, summary, requests, conflicted)],
  };
}

/**
 * SOAP's containers: each interface, placed by its index in the project's `interfaceIds`. An
 * interface summary carries no `order` on the wire; its position is the project's own order.
 */
export const soapExplorerTree: KindExplorerTree = {
  scriptContainers: ['interface'],
  kind: 'soap',
  containers: ({ interfaces, requests, conflicted }) =>
    interfaces.map((summary, index) => ({ order: index, node: interfaceNode(summary, requests, conflicted) })),
};
