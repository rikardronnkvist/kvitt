import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, Users, UsersRound } from 'lucide-react';
import { get, put } from '../api/client.js';
import { getUserDisplayName } from '../lib/users.js';

function AdminSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {[1, 2].map((column) => (
        <section key={column} className="surface-card space-y-5 p-6">
          <div className="skeleton h-5 w-32 rounded-md" />
          {[1, 2, 3].map((item) => (
            <div key={item} className="space-y-3 rounded-lg border border-[var(--border-subtle)] p-4">
              <div className="skeleton h-11 rounded-lg" />
              <div className="skeleton h-11 rounded-lg" />
              <div className="skeleton h-11 rounded-lg" />
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

export default function Admin() {
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [userDrafts, setUserDrafts] = useState({});
  const [groupDrafts, setGroupDrafts] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState(null);
  const [savingGroupId, setSavingGroupId] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [usersData, groupsData] = await Promise.all([
        get('/api/admin/users'),
        get('/api/admin/groups'),
      ]);
      setUsers(usersData);
      setGroups(groupsData);
      setUserDrafts(Object.fromEntries(usersData.map((user) => [user.id, {
        email: user.email,
        is_admin: Boolean(user.is_admin),
        full_name: user.full_name,
      }])));
      setGroupDrafts(Object.fromEntries(groupsData.map((group) => [group.id, { name: group.name }])));
      setError('');
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleUserDraftChange = (userId, key, value) => {
    setUserDrafts((previous) => ({
      ...previous,
      [userId]: {
        ...previous[userId],
        [key]: value,
      },
    }));
  };

  const handleGroupDraftChange = (groupId, value) => {
    setGroupDrafts((previous) => ({
      ...previous,
      [groupId]: {
        ...previous[groupId],
        name: value,
      },
    }));
  };

  const handleSaveUser = async (userId) => {
    const draft = userDrafts[userId];
    if (!draft) return;

    setSavingUserId(userId);
    setError('');
    try {
      const updated = await put(`/api/admin/users/${userId}`, {
        email: draft.email,
        is_admin: Boolean(draft.is_admin),
        full_name: draft.full_name,
      });
      setUsers((previous) => previous.map((user) => (user.id === userId ? updated : user)));
      setUserDrafts((previous) => ({
        ...previous,
        [userId]: {
          email: updated.email,
          is_admin: Boolean(updated.is_admin),
          full_name: updated.full_name,
        },
      }));
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSavingUserId(null);
    }
  };

  const handleSaveGroup = async (groupId) => {
    const draft = groupDrafts[groupId];
    if (!draft) return;

    setSavingGroupId(groupId);
    setError('');
    try {
      const updated = await put(`/api/admin/groups/${groupId}`, {
        name: draft.name,
      });
      setGroups((previous) => previous.map((group) => (group.id === groupId ? updated : group)));
      setGroupDrafts((previous) => ({
        ...previous,
        [groupId]: { name: updated.name },
      }));
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSavingGroupId(null);
    }
  };

  return (
    <div className="space-y-8">
      <section className="surface-card flex flex-col gap-4 p-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <p className="section-eyebrow">Administration</p>
          <h1 className="page-title">Hantera användare och grupper</h1>
          <p className="page-copy">Ett avskalat arbetsflöde för att uppdatera användardata och gruppnamn utan att lämna överblicken.</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] px-3 py-2 text-sm text-[var(--text-secondary)]">
          <ShieldCheck className="h-4 w-4" />
          Endast admin
        </div>
      </section>

      {error ? <p className="rounded-lg border border-[color:color-mix(in_srgb,var(--danger)_20%,transparent)] bg-[color:color-mix(in_srgb,var(--danger)_8%,transparent)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p> : null}

      {loading ? <AdminSkeleton /> : null}

      {!loading ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="surface-card space-y-5 p-6">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-[var(--text-secondary)]" />
              <h2 className="m-0 text-lg font-semibold">Användare</h2>
            </div>
            <div className="space-y-4">
              {users.map((user) => {
                const draft = userDrafts[user.id] || { email: '', is_admin: false, full_name: '' };
                return (
                  <article key={user.id} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] p-4">
                    <div className="grid gap-4">
                      <p className="m-0 text-sm font-medium">{getUserDisplayName(draft)}</p>
                      <label className="field-label">
                        Fullständigt namn
                        <input
                          value={draft.full_name}
                          onChange={(event) => handleUserDraftChange(user.id, 'full_name', event.target.value)}
                        />
                      </label>
                      <label className="field-label">
                        E-post
                        <input
                          type="email"
                          value={draft.email}
                          onChange={(event) => handleUserDraftChange(user.id, 'email', event.target.value)}
                        />
                      </label>
                      <label className="flex min-h-11 items-center gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-strong)] px-3 py-3 text-sm font-medium text-[var(--text-secondary)]">
                        <input
                          type="checkbox"
                          checked={Boolean(draft.is_admin)}
                          onChange={(event) => handleUserDraftChange(user.id, 'is_admin', event.target.checked)}
                        />
                        Administratör
                      </label>
                      <p className="m-0 text-sm text-[var(--text-secondary)]">Antal grupper: {user.group_count}</p>
                      <button type="button" className="btn-primary" onClick={() => handleSaveUser(user.id)} disabled={savingUserId === user.id}>
                        {savingUserId === user.id ? 'Sparar...' : 'Spara användare'}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="surface-card space-y-5 p-6">
            <div className="flex items-center gap-2">
              <UsersRound className="h-4 w-4 text-[var(--text-secondary)]" />
              <h2 className="m-0 text-lg font-semibold">Grupper</h2>
            </div>
            <div className="space-y-4">
              {groups.map((group) => {
                const draft = groupDrafts[group.id] || { name: '' };
                return (
                  <article key={group.id} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] p-4">
                    <div className="grid gap-4">
                      <label className="field-label">
                        Gruppnamn
                        <input
                          value={draft.name}
                          onChange={(event) => handleGroupDraftChange(group.id, event.target.value)}
                        />
                      </label>
                      <div className="space-y-1 text-sm text-[var(--text-secondary)]">
                        <p className="m-0">Skapad av: {getUserDisplayName({ full_name: group.created_by_full_name, email: group.created_by_email })}</p>
                        <p className="m-0">Antal medlemmar: {group.member_count}</p>
                      </div>
                      <button type="button" className="btn-primary" onClick={() => handleSaveGroup(group.id)} disabled={savingGroupId === group.id}>
                        {savingGroupId === group.id ? 'Sparar...' : 'Spara grupp'}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
