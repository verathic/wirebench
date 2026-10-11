/**
 * The right-click menus of a host and of a group, wrapped around whatever shows them (a card, a
 * section heading). The actions edit `hosts.yaml` through the hosts store and open a terminal
 * through `connect.ts`; nothing here knows how the host is drawn.
 */
import * as ContextMenu from '@radix-ui/react-context-menu';
import type { ReactElement } from 'react';
import type { GroupEntryWire, HostEntryWire } from '../../../shared/ssh-wire.js';
import { openTerminalFor } from './connect.js';
import {
  ancestorsOf,
  findHost,
  flattenGroups,
  freeId,
  moveHost,
  removeGroup,
  removeHost,
  upsertHost,
  useHostsStore,
} from './hosts-store.js';

const ITEM_CLASS =
  'flex cursor-pointer items-center rounded px-2 py-1.5 text-sm text-fg-default outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[highlighted]:bg-accent-muted';
const CONTENT_CLASS = 'min-w-40 rounded-md border border-hairline bg-surface-raised p-1 shadow-lg';

/** Connect, Edit, Duplicate, Move to…, Copy address and Delete for `host`, on right-click of `children`. */
export function HostMenu({ host, children }: { readonly host: HostEntryWire; readonly children: ReactElement }) {
  const { file, save, openDialog } = useHostsStore();
  const parent = ancestorsOf(file, 'host', host.id).at(-1);
  const targets = flattenGroups(file).filter(({ group }) => group.id !== parent?.id);
  const duplicate = (): void => {
    const entry = findHost(file, host.id);
    if (entry === undefined) return;
    void save(
      upsertHost(file, { ...entry, id: freeId(file, `${entry.id}-copy`), name: `${entry.name} copy` }, parent?.id),
    );
  };
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className={CONTENT_CLASS}>
          <ContextMenu.Item
            className={ITEM_CLASS}
            onSelect={() => {
              openTerminalFor(host.id);
            }}
          >
            Connect
          </ContextMenu.Item>
          <ContextMenu.Item
            className={ITEM_CLASS}
            onSelect={() => {
              openDialog({ mode: 'edit-host', id: host.id });
            }}
          >
            Edit…
          </ContextMenu.Item>
          <ContextMenu.Item className={ITEM_CLASS} onSelect={duplicate}>
            Duplicate
          </ContextMenu.Item>
          <ContextMenu.Sub>
            <ContextMenu.SubTrigger className={ITEM_CLASS}>Move to…</ContextMenu.SubTrigger>
            <ContextMenu.Portal>
              <ContextMenu.SubContent className={CONTENT_CLASS}>
                {parent !== undefined && (
                  <ContextMenu.Item
                    className={ITEM_CLASS}
                    onSelect={() => {
                      void save(moveHost(file, host.id, undefined));
                    }}
                  >
                    (top level)
                  </ContextMenu.Item>
                )}
                {targets.map(({ group, depth }) => (
                  <ContextMenu.Item
                    key={group.id}
                    className={ITEM_CLASS}
                    style={{ paddingLeft: `${String(depth * 12 + 8)}px` }}
                    onSelect={() => {
                      void save(moveHost(file, host.id, group.id));
                    }}
                  >
                    {group.name}
                  </ContextMenu.Item>
                ))}
              </ContextMenu.SubContent>
            </ContextMenu.Portal>
          </ContextMenu.Sub>
          <ContextMenu.Item
            className={ITEM_CLASS}
            onSelect={() => {
              void navigator.clipboard.writeText(host.address);
            }}
          >
            Copy address
          </ContextMenu.Item>
          <ContextMenu.Separator className="my-1 h-px bg-hairline" />
          <ContextMenu.Item
            className={ITEM_CLASS}
            onSelect={() => {
              void save(removeHost(file, host.id));
            }}
          >
            Delete
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

/** Edit, New host here, New subgroup and Delete (only while empty) for `group`, on right-click of `children`. */
export function GroupMenu({ group, children }: { readonly group: GroupEntryWire; readonly children: ReactElement }) {
  const { file, save, openDialog } = useHostsStore();
  const empty = group.groups.length === 0 && group.hosts.length === 0;
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className={CONTENT_CLASS}>
          <ContextMenu.Item
            className={ITEM_CLASS}
            onSelect={() => {
              openDialog({ mode: 'edit-group', id: group.id });
            }}
          >
            Edit group…
          </ContextMenu.Item>
          <ContextMenu.Item
            className={ITEM_CLASS}
            onSelect={() => {
              openDialog({ mode: 'new-host', parent: group.id });
            }}
          >
            New host here…
          </ContextMenu.Item>
          <ContextMenu.Item
            className={ITEM_CLASS}
            onSelect={() => {
              openDialog({ mode: 'new-group', parent: group.id });
            }}
          >
            New subgroup…
          </ContextMenu.Item>
          <ContextMenu.Separator className="my-1 h-px bg-hairline" />
          <ContextMenu.Item
            className={ITEM_CLASS}
            disabled={!empty}
            onSelect={() => {
              void save(removeGroup(file, group.id));
            }}
          >
            Delete group
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
