import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { get, post } from '../api/client.js';
import ExpenseFormFields from '../components/ExpenseFormFields.jsx';
import { createExpenseForm } from '../lib/expenseForm.js';
import { getCurrentUserId } from '../lib/session.js';

export default function AddExpense() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [group, setGroup] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => createExpenseForm({ members: [], currentUserId: getCurrentUserId() }));

  useEffect(() => {
    const loadGroup = async () => {
      setLoading(true);
      try {
        const data = await get(`/api/groups/${id}`);
        setGroup(data);
        setForm(createExpenseForm({ members: data.members || [], currentUserId: getCurrentUserId() }));
        setError('');
      } catch (loadError) {
        setError(loadError.message);
      } finally {
        setLoading(false);
      }
    };

    loadGroup();
  }, [id]);

  const handleSubmit = async (payload) => {
    setSaving(true);
    setError('');
    try {
      await post(`/api/expenses/${id}`, payload);
      navigate(`/groups/${id}`);
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
        <button type="button" className="btn-secondary" onClick={() => navigate(`/groups/${id}`)}>
          <ArrowLeft className="h-4 w-4" />
          Tillbaka till {group?.name}
        </button>
        <div>
          <p className="section-eyebrow">Ny utgift</p>
          <h1 className="page-title">Lägg till utgift i {group?.name}</h1>
          <p className="page-copy">Fyll i detaljerna och välj om kostnaden ska delas lika eller med egna belopp.</p>
        </div>
      </div>

      <section className="surface-card p-6 sm:p-7">
        <ExpenseFormFields
          form={form}
          setForm={setForm}
          members={group?.members || []}
          error={error}
          saving={saving}
          onCancel={() => navigate(`/groups/${id}`)}
          onError={setError}
          onSubmit={handleSubmit}
          submitLabel="Spara utgift"
        />
      </section>
    </div>
  );
}
