import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderPlus } from 'lucide-react';
import GroupCard from '../components/GroupCard.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { get } from '../api/client.js';

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
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

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

  const activeGroups = groups.filter((group) => !group.archived_at);
  const archivedGroups = groups.filter((group) => Boolean(group.archived_at));

  return (
    <div className="space-y-8">


      {error ? <p className="rounded-lg border border-[color:color-mix(in_srgb,var(--danger)_20%,transparent)] bg-[color:color-mix(in_srgb,var(--danger)_8%,transparent)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p> : null}

      {loading ? <DashboardSkeleton /> : null}

      {!loading ? (
        <>
          {groups.length ? (
            <div className="space-y-6">
              {activeGroups.length ? (
                <section className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    {activeGroups.map((group) => (
                      <GroupCard key={group.id} group={group} onOpen={(groupSlug) => navigate(`/groups/${groupSlug}`)} />
                    ))}
                  </div>
                </section>
              ) : null}

              {archivedGroups.length ? (
                <section className="space-y-4 pt-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    {archivedGroups.map((group) => (
                      <GroupCard key={group.id} group={group} onOpen={(groupSlug) => navigate(`/groups/${groupSlug}`)} />
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          ) : (
            <EmptyState
              icon={FolderPlus}
              title="Du har inga grupper ännu"
              description="Skapa din första grupp för att börja dela kostnader, följa saldon och registrera betalningar."
            />
          )}
        </>
      ) : null}
    </div>
  );
}
