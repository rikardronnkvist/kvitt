import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderPlus } from 'lucide-react';
import GroupCard from '../components/GroupCard.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { get, post } from '../api/client.js';

function DashboardSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {[1, 2, 3, 4].map((item) => (
        <div key={item} className="surface-card space-y-5 p-5">
          <div className="skeleton h-5 w-28 rounded-md" />
          <div className="skeleton h-4 w-20 rounded-md" />
          <div className="skeleton h-10 rounded-md" />
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    try {
      const data = await get('/api/groups');
      setGroups(data);
      setError('');
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const handleCreateGroup = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await post('/api/groups', { name: newGroupName });
      setNewGroupName('');
      await loadGroups();
    } catch (createError) {
      setError(createError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="section-eyebrow">Översikt</p>
          <h1 className="page-title">Dina grupper</h1>
          <p className="page-copy">Håll koll på varje grupps saldo och skapa nya kostnadsytor utan extra brus.</p>
        </div>

        <form onSubmit={handleCreateGroup} className="surface-card flex w-full flex-col gap-3 p-4 sm:flex-row lg:max-w-xl">
          <input
            value={newGroupName}
            onChange={(event) => setNewGroupName(event.target.value)}
            placeholder="Namn på ny grupp"
            required
          />
          <button type="submit" className="btn-primary shrink-0" disabled={saving}>
            {saving ? 'Sparar...' : 'Skapa grupp'}
          </button>
        </form>
      </section>

      {error ? <p className="rounded-lg border border-[color:color-mix(in_srgb,var(--danger)_20%,transparent)] bg-[color:color-mix(in_srgb,var(--danger)_8%,transparent)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p> : null}

      {loading ? <DashboardSkeleton /> : null}

      {!loading ? (
        <>
          {groups.length ? (
            <section className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                {groups.map((group) => (
                  <GroupCard key={group.id} group={group} onOpen={(groupId) => navigate(`/groups/${groupId}`)} />
                ))}
              </div>
            </section>
          ) : (
            <EmptyState
              icon={FolderPlus}
              title="Du har inga grupper ännu"
              description="Skapa din första grupp för att börja dela kostnader, följa saldon och registrera betalningar."
              action={(
                <button type="button" className="btn-primary" onClick={() => document.querySelector('input')?.focus()}>
                  Skapa din första grupp
                </button>
              )}
            />
          )}
        </>
      ) : null}
    </div>
  );
}
