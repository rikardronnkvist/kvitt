import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { get, post } from '../api/client.js';
import ExpenseFormFields from '../components/ExpenseFormFields.jsx';
import { createExpenseForm } from '../lib/expenseForm.js';
import { getCurrentUserId } from '../lib/session.js';
import { t } from '../lib/i18n.js';

export default function AddExpense() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [group, setGroup] = useState(null);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => createExpenseForm({ members: [], categories: [], currentUserId: getCurrentUserId() }));
  const isArchived = Boolean(group?.archived_at);

  useEffect(() => {
    const loadGroup = async () => {
      setLoading(true);
      try {
        const [groupData, categoriesData] = await Promise.all([
          get(`/api/groups/${slug}`),
          get('/api/expenses/categories'),
        ]);
        setGroup(groupData);
        setCategories(categoriesData);
        setForm(createExpenseForm({ members: groupData.members || [], categories: categoriesData, currentUserId: getCurrentUserId() }));
        setError('');
      } catch (loadError) {
        setError(loadError.message);
      } finally {
        setLoading(false);
      }
    };

    loadGroup();
  }, [slug]);

  const groupSlug = group?.slug || slug;
  const groupId = Number(group?.id);

  useEffect(() => {
    if (!group?.name) return undefined;
    document.title = `Kvitt | ${group.name}`;
    return () => {
      document.title = 'Kvitt';
    };
  }, [group?.name]);

  const handleSubmit = async (payload) => {
    setSaving(true);
    setError('');
    try {
      await post(`/api/expenses/${groupId}`, payload);
      navigate(`/groups/${groupSlug}`);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="skeleton h-4 w-24 rounded-md" />
          <div className="skeleton h-8 w-64 rounded-md" />
          <div className="skeleton h-4 w-80 rounded-md" />
        </div>
        <div className="surface-card space-y-4 p-6">
          <div className="skeleton h-11 rounded-lg" />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="skeleton h-24 rounded-lg" />
            <div className="skeleton h-24 rounded-lg" />
          </div>
          <div className="skeleton h-56 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <button type="button" className="btn-secondary" onClick={() => navigate(`/groups/${groupSlug}`)}>
          <ArrowLeft className="h-4 w-4" />
          {t('addExpensePage.backToGroup', { groupName: group?.name })}
        </button>
        <div>
          <p className="section-eyebrow">{t('addExpensePage.newExpenseEyebrow')}</p>
          <h1 className="page-title">{t('addExpensePage.title', { groupName: group?.name })}</h1>
          <p className="page-copy">{t('addExpensePage.description')}</p>
        </div>
      </div>

      <section className="surface-card p-6 sm:p-7">
        {isArchived ? (
          <p className="m-0 rounded-lg border border-[var(--border-subtle)] bg-[var(--app-surface-muted)] px-4 py-3 text-sm text-[var(--text-secondary)]">
            {t('addExpensePage.archivedReadOnly')}
          </p>
        ) : (
          <ExpenseFormFields
            form={form}
            setForm={setForm}
            members={group?.members || []}
            categories={categories}
            mileageRate={Number(group?.mileage_rate) > 0 ? Number(group.mileage_rate) : 20}
            error={error}
            saving={saving}
            onCancel={() => navigate(`/groups/${groupSlug}`)}
            onError={setError}
            onSubmit={handleSubmit}
            submitLabel={t('expenseModals.saveExpense')}
          />
        )}
      </section>
    </div>
  );
}
