import { useCallback, useEffect, useRef, useState } from 'react';
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
  const groupsSnapshotRef = useRef('');

  const createGroupsSnapshot = useCallback((groupList) => (
    groupList
      .map((group) => `${group.id}:${group.last_activity_at ?? ''}:${group.current_user_balance ?? 0}:${group.archived_at ?? ''}`)
      .join('|')
  ), []);

  const loadGroups = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const data = await get('/api/groups');
      setGroups(data);
      groupsSnapshotRef.current = createGroupsSnapshot(data);
      setError('');
    } catch (loadError) {
      if (!silent) setError(loadError.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [createGroupsSnapshot]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  // Poll for changes while visible so balances stay current without a manual reload.
  useEffect(() => {
    const POLL_INTERVAL = 20_000;
    let timerId = null;

    const checkAndRefresh = async () => {
      if (document.hidden) return;
      try {
        const data = await get('/api/groups');
        const nextSnapshot = createGroupsSnapshot(data);
        if (groupsSnapshotRef.current !== '' && nextSnapshot !== groupsSnapshotRef.current) {
          setGroups(data);
          groupsSnapshotRef.current = nextSnapshot;
        }
      } catch {
        // ignore poll errors
      }
    };

    const schedule = () => {
      timerId = window.setTimeout(async () => {
        await checkAndRefresh();
        schedule();
      }, POLL_INTERVAL);
    };

    const onVisibilityChange = () => { checkAndRefresh(); };

    schedule();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.clearTimeout(timerId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [createGroupsSnapshot]);

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
