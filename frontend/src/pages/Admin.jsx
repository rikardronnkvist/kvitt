import { useCallback, useEffect, useState } from 'react';
import { Link2, RefreshCw, ShieldCheck, Tags, Users, UsersRound } from 'lucide-react';
import { get, post, put } from '../api/client.js';
import { CATEGORY_ICON_OPTIONS, getCategoryIcon } from '../lib/expenseCategories.js';
import { GROUP_THEMES, getThemeForGroup } from '../lib/groupTheme.js';
import { getUserDisplayName } from '../lib/users.js';

function AdminSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((item) => (
        <div key={item} className="space-y-3 rounded-lg border border-[var(--border-subtle)] p-4">
          <div className="skeleton h-11 rounded-lg" />
          <div className="skeleton h-11 rounded-lg" />
          <div className="skeleton h-11 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

export default function Admin() {
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [categories, setCategories] = useState([]);
  const [userDrafts, setUserDrafts] = useState({});
  const [groupDrafts, setGroupDrafts] = useState({});
  const [categoryDrafts, setCategoryDrafts] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState(null);
  const [savingGroupId, setSavingGroupId] = useState(null);
  const [savingCategoryId, setSavingCategoryId] = useState(null);
  const [activeTab, setActiveTab] = useState('users');
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [registrationToken, setRegistrationToken] = useState('');
  const [registrationUrl, setRegistrationUrl] = useState('');
  const [savingRegistration, setSavingRegistration] = useState(false);
  const [resettingRegistration, setResettingRegistration] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [usersData, groupsData, categoriesData, registrationData] = await Promise.all([
        get('/api/admin/users'),
        get('/api/admin/groups'),
        get('/api/admin/categories'),
        get('/api/admin/registration-access'),
      ]);
      setUsers(usersData);
      setGroups(groupsData);
      setCategories(categoriesData);
      setUserDrafts(Object.fromEntries(usersData.map((user) => [user.id, {
        is_admin: Boolean(user.is_admin),
        full_name: user.full_name,
      }])));
      setGroupDrafts(Object.fromEntries(groupsData.map((group) => [group.id, {
        name: group.name,
        theme_color: group.theme_color ?? null,
        mileage_rate: Number(group.mileage_rate) > 0 ? group.mileage_rate : 20,
      }])));
      setCategoryDrafts(Object.fromEntries(categoriesData.map((category) => [category.id, {
        name: category.name,
        icon: category.icon,
        sort_order: category.sort_order,
      }])));
      setSelectedGroupId((previous) => {
        if (!groupsData.length) return null;
        if (previous && groupsData.some((group) => group.id === previous)) return previous;
        return groupsData[0].id;
      });
      setRegistrationToken(registrationData.token || '');
      setRegistrationUrl(registrationData.registration_url || '');
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
      [userId]: { ...previous[userId], [key]: value },
    }));
  };

  const handleGroupDraftChange = (groupId, key, value) => {
    setGroupDrafts((previous) => ({
      ...previous,
      [groupId]: { ...previous[groupId], [key]: value },
    }));
  };

  const handleCategoryDraftChange = (categoryId, key, value) => {
    setCategoryDrafts((previous) => ({
      ...previous,
      [categoryId]: { ...previous[categoryId], [key]: value },
    }));
  };

  const handleSaveUser = async (userId) => {
    const draft = userDrafts[userId];
    if (!draft) return;
    setSavingUserId(userId);
    setError('');
    try {
      const updated = await put(`/api/admin/users/${userId}`, {
        is_admin: Boolean(draft.is_admin),
        full_name: draft.full_name,
      });
      setUsers((previous) => previous.map((user) => (user.id === userId ? updated : user)));
      setUserDrafts((previous) => ({
        ...previous,
        [userId]: { is_admin: Boolean(updated.is_admin), full_name: updated.full_name },
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
        theme_color: draft.theme_color ?? null,
        mileage_rate: Number(draft.mileage_rate) > 0 ? Number(draft.mileage_rate) : 20,
      });
      setGroups((previous) => previous.map((group) => (group.id === groupId ? updated : group)));
      setGroupDrafts((previous) => ({
        ...previous,
        [groupId]: {
          name: updated.name,
          theme_color: updated.theme_color ?? null,
          mileage_rate: Number(updated.mileage_rate) > 0 ? updated.mileage_rate : 20,
        },
      }));
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSavingGroupId(null);
    }
  };

  const handleSaveCategory = async (categoryId) => {
    const draft = categoryDrafts[categoryId];
    if (!draft) return;
    setSavingCategoryId(categoryId);
    setError('');
    try {
      const updated = await put(`/api/admin/categories/${categoryId}`, {
        name: draft.name,
        icon: draft.icon,
        sort_order: Number(draft.sort_order) || 0,
      });
      setCategories((previous) => previous.map((category) => (category.id === categoryId ? updated : category)));
      setCategoryDrafts((previous) => ({
        ...previous,
        [categoryId]: {
          name: updated.name,
          icon: updated.icon,
          sort_order: updated.sort_order,
        },
      }));
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSavingCategoryId(null);
    }
  };

  const updateRegistrationAccess = (data) => {
    setRegistrationToken(data.token || '');
    setRegistrationUrl(data.registration_url || '');
  };

  const handleSaveRegistrationToken = async () => {
    setSavingRegistration(true);
    setError('');
    try {
      const updated = await put('/api/admin/registration-access', { token: registrationToken.trim() });
      updateRegistrationAccess(updated);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSavingRegistration(false);
    }
  };

  const handleResetRegistrationToken = async () => {
    setResettingRegistration(true);
    setError('');
    try {
      const updated = await post('/api/admin/registration-access/reset', {});
      updateRegistrationAccess(updated);
    } catch (resetError) {
      setError(resetError.message);
    } finally {
      setResettingRegistration(false);
    }
  };

  const handleCopyRegistrationUrl = async () => {
    setError('');
    try {
      await navigator.clipboard.writeText(registrationUrl);
    } catch {
      setError('Kunde inte kopiera länken.');
    }
  };

  const tabs = [
    { id: 'users', label: 'Användare', icon: Users, count: users.length },
    { id: 'groups', label: 'Grupper', icon: UsersRound, count: groups.length },
    { id: 'categories', label: 'Kategorier', icon: Tags, count: categories.length },
  ];
  const selectedGroup = groups.find((group) => group.id === selectedGroupId) ?? null;
  const selectedGroupDraft = selectedGroup ? (groupDrafts[selectedGroup.id] ?? {
    name: selectedGroup.name,
    theme_color: selectedGroup.theme_color ?? null,
    mileage_rate: Number(selectedGroup.mileage_rate) > 0 ? selectedGroup.mileage_rate : 20,
  }) : null;

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

      <section className="surface-card space-y-4 p-6">
        <div className="space-y-1">
          <p className="section-eyebrow">Registrering</p>
          <h2 className="m-0 text-lg font-semibold">Registreringslänk</h2>
          <p className="m-0 text-sm text-[var(--text-secondary)]">Endast besökare med denna länk kan skapa konto.</p>
        </div>
        <label className="field-label">
          Registreringsnyckel
          <input
            value={registrationToken}
            onChange={(event) => setRegistrationToken(event.target.value)}
            placeholder="Lång unik nyckel"
          />
        </label>
        <label className="field-label">
          Registrerings-URL
          <input value={registrationUrl} readOnly />
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary" onClick={handleSaveRegistrationToken} disabled={savingRegistration || resettingRegistration || registrationToken.trim().length < 16}>
            {savingRegistration ? 'Sparar...' : 'Spara nyckel'}
          </button>
          <button type="button" className="btn-secondary" onClick={handleResetRegistrationToken} disabled={savingRegistration || resettingRegistration}>
            <RefreshCw className="h-4 w-4" />
            {resettingRegistration ? 'Återställer...' : 'Återställ nyckel'}
          </button>
          <button type="button" className="btn-secondary" onClick={handleCopyRegistrationUrl} disabled={!registrationUrl}>
            <Link2 className="h-4 w-4" />
            Kopiera länk
          </button>
        </div>
      </section>

      {error ? <p className="rounded-lg border border-[color:color-mix(in_srgb,var(--danger)_20%,transparent)] bg-[color:color-mix(in_srgb,var(--danger)_8%,transparent)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p> : null}

      <div className="surface-card overflow-hidden">
        <div className="flex border-b border-[var(--border-subtle)]">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={[
                'flex items-center gap-2 px-5 py-3.5 text-sm font-medium transition border-b-2 -mb-px',
                activeTab === tab.id
                  ? 'border-[var(--accent)] text-[var(--accent)]'
                  : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
              ].join(' ')}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
              {!loading ? (
                <span className={[
                  'rounded-full px-2 py-0.5 text-xs font-semibold',
                  activeTab === tab.id
                    ? 'bg-[color:color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--accent)]'
                    : 'bg-[var(--app-surface-muted)] text-[var(--text-muted)]',
                ].join(' ')}>
                  {tab.count}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="p-6">
          {loading ? <AdminSkeleton /> : null}

          {!loading && activeTab === 'users' ? (
            <div className="space-y-4">
              {users.map((user) => {
                const draft = userDrafts[user.id] || { is_admin: false, full_name: '' };
                return (
                  <article key={user.id} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] p-4">
                    <div className="grid gap-4">
                      <p className="m-0 text-sm font-medium">{getUserDisplayName(draft)}</p>
                      <label className="field-label">
                        Fullständigt namn
                        <input
                          value={draft.full_name || ''}
                          onChange={(event) => handleUserDraftChange(user.id, 'full_name', event.target.value)}
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
          ) : null}

          {!loading && activeTab === 'groups' ? (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
              <aside className="space-y-2">
                {groups.map((group) => {
                  const theme = getThemeForGroup(group);
                  const isActive = selectedGroupId === group.id;
                  return (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => setSelectedGroupId(group.id)}
                      className={[
                        'w-full rounded-lg border px-4 py-3 text-left transition',
                        isActive
                          ? 'border-[var(--border-strong)] bg-[var(--app-surface-muted)]'
                          : 'border-[var(--border-subtle)] bg-[var(--app-surface-strong)] hover:bg-[var(--app-surface-muted)]',
                      ].join(' ')}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="m-0 truncate text-sm font-semibold">{group.name}</p>
                          <p className="mt-1 m-0 text-xs text-[var(--text-secondary)]">{group.member_count} medlemmar</p>
                        </div>
                        <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: theme.base }} />
                      </div>
                    </button>
                  );
                })}
              </aside>

              {selectedGroup && selectedGroupDraft ? (
                <section className="space-y-6 rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] p-5 sm:p-6">
                  <div className="space-y-1">
                    <p className="section-eyebrow">Grupp</p>
                    <h3 className="m-0 text-lg font-semibold">Gruppinställningar</h3>
                    <p className="m-0 text-sm text-[var(--text-secondary)]">Redigera namn och färgtema för vald grupp.</p>
                  </div>

                  <div className="space-y-3">
                    <label className="field-label">
                      Gruppnamn
                      <input
                        value={selectedGroupDraft.name}
                        onChange={(event) => handleGroupDraftChange(selectedGroup.id, 'name', event.target.value)}
                      />
                    </label>
                    <label className="field-label">
                      Milkostnad för Bilresa (kr/mil)
                      <input
                        type="number"
                        min="0.1"
                        step="0.1"
                        value={selectedGroupDraft.mileage_rate}
                        onChange={(event) => handleGroupDraftChange(selectedGroup.id, 'mileage_rate', event.target.value)}
                      />
                    </label>
                  </div>

                  <div className="space-y-3">
                    <p className="field-label">Färgtema</p>
                    <div className="flex flex-wrap gap-2">
                      {GROUP_THEMES.map((theme) => {
                        const activeThemeId = selectedGroupDraft.theme_color ?? getThemeForGroup(selectedGroup).id;
                        const isActive = activeThemeId === theme.id;
                        return (
                          <button
                            key={theme.id}
                            type="button"
                            title={theme.name}
                            onClick={() => handleGroupDraftChange(selectedGroup.id, 'theme_color', theme.id)}
                            className="h-7 w-7 rounded-full transition hover:scale-110 focus:outline-none focus-visible:ring-2"
                            style={{
                              background: theme.base,
                              outline: isActive ? `2px solid ${theme.base}` : undefined,
                              outlineOffset: isActive ? '2px' : undefined,
                              boxShadow: isActive ? `0 0 0 3px rgba(255,255,255,0.9), 0 0 0 5px ${theme.base}` : undefined,
                            }}
                            aria-pressed={isActive}
                            aria-label={theme.name}
                          />
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-1 text-sm text-[var(--text-secondary)]">
                    <p className="m-0">Skapad av: {getUserDisplayName({ full_name: selectedGroup.created_by_full_name })}</p>
                    <p className="m-0">Antal medlemmar: {selectedGroup.member_count}</p>
                  </div>

                  <button type="button" className="btn-primary" onClick={() => handleSaveGroup(selectedGroup.id)} disabled={savingGroupId === selectedGroup.id}>
                    {savingGroupId === selectedGroup.id ? 'Sparar...' : 'Spara grupp'}
                  </button>
                </section>
              ) : (
                <section className="rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] p-6">
                  <p className="m-0 text-sm text-[var(--text-secondary)]">Välj en grupp i listan för att redigera inställningar.</p>
                </section>
              )}
            </div>
          ) : null}

          {!loading && activeTab === 'categories' ? (
            <div className="space-y-4">
              {categories.map((category) => {
                const draft = categoryDrafts[category.id] ?? {
                  name: category.name,
                  icon: category.icon,
                  sort_order: category.sort_order,
                };
                const CategoryIcon = getCategoryIcon(draft.icon);
                return (
                  <article key={category.id} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] p-4">
                    <div className="grid gap-4 md:grid-cols-3">
                      <label className="field-label md:col-span-2">
                        Kategorinamn
                        <input
                          value={draft.name}
                          onChange={(event) => handleCategoryDraftChange(category.id, 'name', event.target.value)}
                        />
                      </label>
                      <label className="field-label">
                        Sortering
                        <input
                          type="number"
                          min="0"
                          value={draft.sort_order}
                          onChange={(event) => handleCategoryDraftChange(category.id, 'sort_order', event.target.value)}
                        />
                      </label>

                      <label className="field-label md:col-span-2">
                        Ikon
                        <select
                          value={draft.icon}
                          onChange={(event) => handleCategoryDraftChange(category.id, 'icon', event.target.value)}
                        >
                          {CATEGORY_ICON_OPTIONS.map((iconOption) => (
                            <option key={iconOption.id} value={iconOption.id}>{iconOption.label}</option>
                          ))}
                        </select>
                      </label>
                      <div className="flex items-end">
                        <div className="inline-flex min-h-11 w-full items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-strong)] px-3 py-2 text-sm text-[var(--text-secondary)]">
                          <CategoryIcon className="h-4 w-4" />
                          <span>Förhandsvisning</span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4">
                      <button type="button" className="btn-primary" onClick={() => handleSaveCategory(category.id)} disabled={savingCategoryId === category.id}>
                        {savingCategoryId === category.id ? 'Sparar...' : 'Spara kategori'}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
