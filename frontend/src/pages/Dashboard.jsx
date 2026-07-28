import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header.jsx';
import GroupCard from '../components/GroupCard.jsx';
import { get, post } from '../api/client.js';

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
    <>
      <Header />
      <main className="page-layout">
        <section>
          <h2>Grupper</h2>
          <form onSubmit={handleCreateGroup} className="card form-inline">
            <input
              value={newGroupName}
              onChange={(event) => setNewGroupName(event.target.value)}
              placeholder="Skapa ny grupp"
              required
            />
            <button type="submit" disabled={saving}>{saving ? 'Sparar...' : 'Skapa grupp'}</button>
          </form>
          {error ? <p className="error-text">{error}</p> : null}
          {loading ? <p>Laddar grupper...</p> : null}
          <div className="grid">
            {groups.map((group) => (
              <GroupCard key={group.id} group={group} onOpen={(groupId) => navigate(`/groups/${groupId}`)} />
            ))}
          </div>
          {!loading && groups.length === 0 ? <p>Du är inte medlem i några grupper ännu.</p> : null}
        </section>
      </main>
    </>
  );
}
