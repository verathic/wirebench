/**
 * The SSH area's fixed first tab: what the area's menu picks — the hosts as cards, the keychain
 * (the secret names hosts sign in with) or the host keys trusted on this machine. Terminal
 * sessions open as tabs after it.
 */
import { useEffect, useState } from 'react';
import { KeyRound, Plus } from 'lucide-react';
import { Button } from '../../components/button.js';
import { ConfirmDialog } from '../../components/confirm-dialog.js';
import type { ResolvedHostWire, SshKnownHostWire, SshSecretNameWire } from '../../../shared/ssh-wire.js';
import { ipc } from '../../state/ipc-client.js';
import { HostCards } from './host-cards.js';
import { useHostsStore } from './hosts-store.js';

const INPUT_CLASS =
  'w-full rounded-md border border-hairline-strong bg-surface-base px-2 py-1 text-sm text-fg-default outline-none focus:ring-1 focus:ring-accent';

export function SshHome() {
  const view = useHostsStore((s) => s.homeView);
  return (
    <div data-testid="ssh-home" className="h-full min-h-0 overflow-auto p-4">
      {view === 'hosts' ? <HostsPanel /> : view === 'keychain' ? <KeychainPanel /> : <KnownHostsPanel />}
    </div>
  );
}

function HostsPanel() {
  const resolved = useHostsStore((s) => s.resolved);
  const problems = useHostsStore((s) => s.problems);
  const filter = useHostsStore((s) => s.filter);
  const setFilter = useHostsStore((s) => s.setFilter);
  const selectedTags = useHostsStore((s) => s.selectedTags);
  const toggleTag = useHostsStore((s) => s.toggleTag);
  const openDialog = useHostsStore((s) => s.openDialog);
  const setImportOpen = useHostsStore((s) => s.setImportOpen);
  const tags = [...new Set(resolved.flatMap((h) => h.tags))].sort();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          aria-label="Filter hosts"
          placeholder="Filter by name, address or tag"
          className={`${INPUT_CLASS} max-w-sm min-w-48 flex-1`}
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
          }}
        />
        <Button
          variant="primary"
          onClick={() => {
            openDialog({ mode: 'new-host' });
          }}
        >
          <Plus size={13} aria-hidden /> New host
        </Button>
        <Button
          onClick={() => {
            openDialog({ mode: 'new-group' });
          }}
        >
          New group
        </Button>
        <Button
          onClick={() => {
            setImportOpen(true);
          }}
        >
          Import…
        </Button>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by tag">
          {tags.map((tag) => (
            <button
              key={tag}
              type="button"
              aria-pressed={selectedTags.includes(tag)}
              onClick={() => {
                toggleTag(tag);
              }}
              className={`rounded-full border border-hairline px-2 py-0.5 text-xs ${
                selectedTags.includes(tag)
                  ? 'bg-accent-muted text-fg-default'
                  : 'text-fg-subtle hover:bg-surface-raised'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}
      {problems.length > 0 && (
        <ul role="alert" aria-label="Hosts problems" className="flex flex-col gap-1 text-sm">
          {problems.map((p, i) => (
            <li
              key={`${p.code}-${String(i)}`}
              className="rounded border border-status-danger px-2 py-1 text-fg-default"
            >
              <span className="font-mono text-xs text-status-danger">{p.code}</span> <span>{p.message}</span>
              {p.path !== undefined && <span className="ml-1 font-mono text-xs text-fg-subtle">{p.path}</span>}
            </li>
          ))}
        </ul>
      )}
      <HostCards />
    </div>
  );
}

/** The names of the hosts that sign in with secret `name`: as their password, key or key passphrase. */
function usersOf(name: string, hosts: readonly ResolvedHostWire[]): string[] {
  return hosts
    .filter((host) => {
      const auth = host.ssh.auth.value;
      if (auth === undefined || auth.kind === 'agent') return false;
      return auth.secret === name || (auth.kind === 'key' && auth.passphraseSecret === name);
    })
    .map((host) => host.name);
}

interface SecretForm {
  readonly name: string;
  /** Setting the value of a listed name: the name is not editable. */
  readonly fixed: boolean;
  readonly value: string;
  readonly error?: string;
}

function KeychainPanel() {
  const resolved = useHostsStore((s) => s.resolved);
  const [names, setNames] = useState<readonly SshSecretNameWire[]>();
  // The value is write-only: it goes to main and never comes back.
  const [form, setForm] = useState<SecretForm>();

  const load = async (): Promise<void> => {
    const result = await ipc().ssh.secretNames(undefined);
    setNames(result.ok ? result.value.names : []);
  };
  useEffect(() => {
    void load();
  }, []);

  const store = async (current: SecretForm): Promise<void> => {
    const name = current.name.trim();
    if (name === '') return;
    const result = await ipc().ssh.setSecret({ name, value: current.value });
    if (!result.ok) {
      setForm({ ...current, value: '', error: result.error.message });
      return;
    }
    setForm(undefined);
    await load();
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <p className="flex-1 text-sm text-fg-subtle">
          The passwords and private keys hosts sign in with, by name. A value is stored on this machine for the
          workspace and is never shown again.
        </p>
        <Button
          variant="primary"
          onClick={() => {
            setForm({ name: '', fixed: false, value: '' });
          }}
        >
          <Plus size={13} aria-hidden /> New secret
        </Button>
      </div>
      {form !== undefined && (
        <form
          aria-label="Store a secret"
          className="flex flex-wrap items-end gap-2 rounded-md border border-hairline p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void store(form);
          }}
        >
          <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs text-fg-subtle">
            Secret name
            <input
              className={`${INPUT_CLASS} font-mono`}
              value={form.name}
              readOnly={form.fixed}
              autoFocus={!form.fixed}
              onChange={(e) => {
                setForm({ ...form, name: e.target.value });
              }}
            />
          </label>
          <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs text-fg-subtle">
            Secret value
            <textarea
              rows={1}
              className={`${INPUT_CLASS} font-mono`}
              value={form.value}
              autoFocus={form.fixed}
              onChange={(e) => {
                setForm({ ...form, value: e.target.value });
              }}
            />
          </label>
          <Button type="submit" variant="primary" disabled={form.name.trim() === ''}>
            Store
          </Button>
          <Button
            onClick={() => {
              setForm(undefined);
            }}
          >
            Cancel
          </Button>
          {form.error !== undefined && (
            <p role="alert" className="w-full text-sm text-status-danger">
              {form.error}
            </p>
          )}
        </form>
      )}
      {names === undefined ? null : names.length === 0 ? (
        <p className="text-sm text-fg-subtle">No secrets yet. Store one here, or from a host's sign-in settings.</p>
      ) : (
        <ul aria-label="Secrets" className="flex flex-col divide-y divide-hairline rounded-md border border-hairline">
          {names.map((secret) => {
            const users = usersOf(secret.name, resolved);
            return (
              <li
                key={secret.name}
                data-testid={`secret-row-${secret.name}`}
                className="flex items-center gap-3 px-3 py-2"
              >
                <KeyRound size={15} aria-hidden="true" className="shrink-0 text-fg-subtle" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-mono text-sm text-fg-default">{secret.name}</span>
                  <span className="truncate text-xs text-fg-subtle">
                    {users.length === 0 ? 'Not used by any host' : `Used by ${users.join(', ')}`}
                  </span>
                </span>
                {secret.external && (
                  <span className="shrink-0 rounded-full border border-hairline px-1.5 text-xs text-fg-subtle">
                    from a secret source
                  </span>
                )}
                {secret.local && (
                  <span className="shrink-0 rounded-full border border-hairline px-1.5 text-xs text-fg-subtle">
                    on this machine
                  </span>
                )}
                {!secret.local && !secret.external && (
                  <span className="shrink-0 rounded-full border border-status-warning px-1.5 text-xs text-status-warning">
                    no value
                  </span>
                )}
                <Button
                  onClick={() => {
                    setForm({ name: secret.name, fixed: true, value: '' });
                  }}
                >
                  Set value…
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function KnownHostsPanel() {
  const [entries, setEntries] = useState<readonly SshKnownHostWire[]>();
  const [error, setError] = useState<string>();
  const [forgetting, setForgetting] = useState<SshKnownHostWire>();

  const load = async (): Promise<void> => {
    const result = await ipc().ssh.knownHosts(undefined);
    if (result.ok) {
      setEntries(result.value.entries);
    } else {
      setEntries([]);
      setError(result.error.message);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const forget = async (entry: SshKnownHostWire): Promise<void> => {
    const result = await ipc().ssh.forgetHostKey({ host: entry.host, keyType: entry.keyType });
    setError(result.ok ? undefined : result.error.message);
    await load();
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-fg-subtle">
        The host keys you trusted on this machine. Forgetting one makes the next connection to that host ask again.
      </p>
      {error !== undefined && (
        <p role="alert" className="text-sm text-status-danger">
          {error}
        </p>
      )}
      {entries === undefined ? null : entries.length === 0 ? (
        <p className="text-sm text-fg-subtle">No trusted host keys yet. The first connection to a host asks.</p>
      ) : (
        <ul
          aria-label="Known hosts"
          className="flex flex-col divide-y divide-hairline rounded-md border border-hairline"
        >
          {entries.map((entry) => (
            <li
              key={`${entry.host} ${entry.keyType}`}
              data-testid={`known-host-${entry.host}`}
              className="flex items-center gap-3 px-3 py-2"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-mono text-sm text-fg-default">{entry.host}</span>
                <span className="truncate font-mono text-xs text-fg-subtle">
                  {entry.keyType} {entry.fingerprint}
                </span>
              </span>
              <Button
                onClick={() => {
                  setForgetting(entry);
                }}
              >
                Forget
              </Button>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={forgetting !== undefined}
        onOpenChange={(open) => {
          if (!open) setForgetting(undefined);
        }}
        title="Forget this host key?"
        description={
          forgetting === undefined
            ? ''
            : `The next connection to ${forgetting.host} will ask you to trust its ${forgetting.keyType} key again.`
        }
        confirmLabel="Forget"
        destructive
        onConfirm={() => {
          const entry = forgetting;
          setForgetting(undefined);
          if (entry !== undefined) void forget(entry);
        }}
      />
    </div>
  );
}
