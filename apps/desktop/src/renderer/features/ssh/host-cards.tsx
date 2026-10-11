/**
 * The hosts of `hosts.yaml` as cards, one section per group (subgroups follow their parent, named
 * by their whole path), hosts outside any group first. A filter or tag narrows the cards to what
 * matches and drops sections left empty. Double-click or Enter connects; right-click has the rest.
 */
import { Server } from 'lucide-react';
import { Button } from '../../components/button.js';
import type { GroupEntryWire, HostEntryWire, HostsFileWire, ResolvedHostWire } from '../../../shared/ssh-wire.js';
import { openTerminalFor } from './connect.js';
import { GroupMenu, HostMenu } from './host-menus.js';
import { useHostsStore } from './hosts-store.js';
import { sessionStatus } from './session-status.js';

interface Section {
  /** Absent for the hosts outside any group. */
  readonly group?: GroupEntryWire;
  /** The group's names from the top, joined: `Production / EU`. */
  readonly title: string;
  readonly hosts: readonly HostEntryWire[];
}

/** The file's hosts in sections: the top level first, then every group in tree order. */
function sectionsOf(file: HostsFileWire): Section[] {
  const out: Section[] = [{ title: 'Ungrouped', hosts: file.hosts }];
  const walk = (groups: readonly GroupEntryWire[], prefix: string): void => {
    for (const group of groups) {
      const title = prefix === '' ? group.name : `${prefix} / ${group.name}`;
      out.push({ group, title, hosts: group.hosts });
      walk(group.groups, title);
    }
  };
  walk(file.groups, '');
  return out;
}

/** `user@address:port`, leaving out what the host does not set and the default port. */
function targetOf(host: HostEntryWire, resolved: ResolvedHostWire | undefined): string {
  const user = resolved?.ssh.user.value;
  const port = resolved?.ssh.port.value;
  return `${user === undefined ? '' : `${user}@`}${host.address}${port === undefined || port === 22 ? '' : `:${String(port)}`}`;
}

function HostCard({
  host,
  resolved,
}: {
  readonly host: HostEntryWire;
  readonly resolved: ResolvedHostWire | undefined;
}) {
  const status = sessionStatus(useHostsStore((s) => s.sessions[host.id]));
  const connect = (): void => {
    openTerminalFor(host.id);
  };
  const warning =
    resolved === undefined
      ? 'unresolved'
      : resolved.incomplete === undefined
        ? undefined
        : `needs ${resolved.incomplete.field}`;
  return (
    <HostMenu host={host}>
      <li
        tabIndex={0}
        data-testid={`host-row-${host.id}`}
        title={`${host.name} — double-click to connect`}
        className="flex min-w-0 cursor-default items-center gap-3 rounded-md border border-hairline bg-surface-raised p-2.5 hover:border-hairline-strong hover:bg-surface-hover focus-visible:ring-1 focus-visible:ring-accent focus-visible:outline-none"
        onDoubleClick={connect}
        onKeyDown={(e) => {
          if (e.key === 'Enter') connect();
        }}
      >
        <span className="relative flex size-8 shrink-0 items-center justify-center rounded-md bg-accent-muted text-fg-default">
          <Server size={15} aria-hidden="true" />
          <span
            aria-label={status.label}
            className={`absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-surface-raised bg-current ${status.color}`}
          />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm text-fg-default">{host.name}</span>
          <span className="truncate font-mono text-xs text-fg-subtle">{targetOf(host, resolved)}</span>
        </span>
        {warning !== undefined && (
          <span className="ml-auto shrink-0 rounded-full border border-status-warning px-1.5 text-xs text-status-warning">
            {warning}
          </span>
        )}
      </li>
    </HostMenu>
  );
}

export function HostCards() {
  const file = useHostsStore((s) => s.file);
  const resolved = useHostsStore((s) => s.resolved);
  const filter = useHostsStore((s) => s.filter);
  const selectedTags = useHostsStore((s) => s.selectedTags);
  const visibleHosts = useHostsStore((s) => s.visibleHosts);

  if (file.groups.length === 0 && file.hosts.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2 p-1 text-sm text-fg-subtle">
        <p>No hosts yet. Add one with New host, or bring yours in from an SSH config.</p>
        <Button
          onClick={() => {
            useHostsStore.getState().setImportOpen(true);
          }}
        >
          Import from SSH config
        </Button>
      </div>
    );
  }

  const narrowed = filter.trim() !== '' || selectedTags.length > 0;
  const hostsById = new Map(resolved.map((h) => [h.id, h] as const));
  // A host the resolver did not place still shows (degraded) unless a filter is active: it has nothing to match on.
  const visible = new Set(visibleHosts().map((h) => h.id));
  const shown = (host: HostEntryWire): boolean => !narrowed || visible.has(host.id);

  const sections = sectionsOf(file)
    .map((section) => ({ ...section, hosts: section.hosts.filter(shown) }))
    // The top level needs no heading when it is all there is; an empty group keeps its heading
    // (its menu is how a host gets into it) unless a filter is narrowing.
    .filter((section) =>
      section.group === undefined ? section.hosts.length > 0 : !narrowed || section.hosts.length > 0,
    );
  const headed = file.groups.length > 0;

  if (sections.length === 0) {
    return <p className="p-1 text-sm text-fg-subtle">No host matches the filter.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {sections.map((section) => {
        const heading = (
          <h3 className="flex items-center gap-2 text-xs font-medium tracking-wider text-fg-subtle uppercase">
            <span className="truncate">{section.title}</span>
            <span className="font-normal">{section.hosts.length}</span>
          </h3>
        );
        return (
          <section key={section.group?.id ?? '(top)'} aria-label={section.title} className="flex flex-col gap-2">
            {headed && (section.group === undefined ? heading : <GroupMenu group={section.group}>{heading}</GroupMenu>)}
            {section.hosts.length === 0 ? (
              <p className="text-xs text-fg-subtle">No hosts in this group. Right-click its name to add one.</p>
            ) : (
              <ul
                aria-label={`Hosts in ${section.title}`}
                className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-2"
              >
                {section.hosts.map((host) => (
                  <HostCard key={host.id} host={host} resolved={hostsById.get(host.id)} />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
