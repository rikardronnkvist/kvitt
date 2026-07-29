import { useEffect, useState } from 'react';
import { post } from '../api/client.js';
import ExpenseFormFields from './ExpenseFormFields.jsx';
import ModalShell from './ModalShell.jsx';
import { createExpenseForm } from '../lib/expenseForm.js';
import { getCurrentUserId } from '../lib/session.js';

export default function NewExpenseModal({ groupId, members, categories, mileageRate, onClose, onSuccess }) {
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => createExpenseForm({ members, categories, currentUserId: getCurrentUserId() }));

  useEffect(() => {
    setForm(createExpenseForm({ members, categories, currentUserId: getCurrentUserId() }));
  }, [members, categories]);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handleSubmit = async (payload) => {
    setSaving(true);
    setError('');

    try {
      await post(`/api/expenses/${groupId}`, payload);
      await onSuccess();
      onClose();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      title="Lägg till utgift"
      description="Registrera en ny kostnad och välj om den ska delas lika eller med egna belopp."
      onClose={onClose}
    >
      <ExpenseFormFields
        form={form}
        setForm={setForm}
        members={members}
        categories={categories}
        mileageRate={mileageRate}
        error={error}
        saving={saving}
        onCancel={onClose}
        onError={setError}
        onSubmit={handleSubmit}
        submitLabel="Spara utgift"
      />
    </ModalShell>
  );
}
