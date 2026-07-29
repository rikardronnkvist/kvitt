import { useCallback, useEffect, useState } from 'react';
import Header from '../components/Header.jsx';
import { get, put } from '../api/client.js';

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
        username: user.username,
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
        username: draft.username,
        email: draft.email,
        is_admin: Boolean(draft.is_admin),
        full_name: draft.full_name,
      });
      setUsers((previous) => previous.map((user) => (user.id === userId ? updated : user)));
      setUserDrafts((previous) => ({
        ...previous,
        [userId]: {
          username: updated.username,
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
    <>
      <Header />
      <main className="page-layout">
        <section className="card">
          <h2>Admin</h2>
          <p>Hantera alla användare och grupper.</p>
          {error ? <p className="error-text">{error}</p> : null}
          {loading ? <p>Laddar admin-data...</p> : null}
        </section>

        {!loading ? (
          <div className="admin-grid">
            <section className="card">
              <h3>Användare</h3>
              <div className="stack">
                {users.map((user) => {
                  const draft = userDrafts[user.id] || { username: '', email: '', is_admin: false };
                  return (
                    <article key={user.id} className="card admin-item">
                      <label>
                        Användarnamn
                        <input
                          value={draft.username}
                          onChange={(event) => handleUserDraftChange(user.id, 'username', event.target.value)}
                        />
                      </label>
                      <label>
                        Fullständigt namn
                        <input
                          value={draft.full_name}
                          onChange={(event) => handleUserDraftChange(user.id, 'full_name', event.target.value)}
                        />
                      </label>
                      <label>
                        E-post
                        <input
                          type="email"
                          value={draft.email}
                          onChange={(event) => handleUserDraftChange(user.id, 'email', event.target.value)}
                        />
                      </label>
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={Boolean(draft.is_admin)}
                          onChange={(event) => handleUserDraftChange(user.id, 'is_admin', event.target.checked)}
                        />
                        Administratör
                      </label>
                      <p>Antal grupper: {user.group_count}</p>
                      <button type="button" onClick={() => handleSaveUser(user.id)} disabled={savingUserId === user.id}>
                        {savingUserId === user.id ? 'Sparar...' : 'Spara användare'}
                      </button>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="card">
              <h3>Grupper</h3>
              <div className="stack">
                {groups.map((group) => {
                  const draft = groupDrafts[group.id] || { name: '' };
                  return (
                    <article key={group.id} className="card admin-item">
                      <label>
                        Gruppnamn
                        <input
                          value={draft.name}
                          onChange={(event) => handleGroupDraftChange(group.id, event.target.value)}
                        />
                      </label>
                      <p>Skapad av: {group.created_by_username}</p>
                      <p>Antal medlemmar: {group.member_count}</p>
                      <button type="button" onClick={() => handleSaveGroup(group.id)} disabled={savingGroupId === group.id}>
                        {savingGroupId === group.id ? 'Sparar...' : 'Spara grupp'}
                      </button>
                    </article>
                  );
                })}
              </div>
            </section>
          </div>
        ) : null}
      </main>
    </>
  );
}
