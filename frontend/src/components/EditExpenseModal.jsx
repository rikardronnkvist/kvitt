import { useEffect, useState } from 'react';
import { del, put } from '../api/client.js';
import ExpenseFormFields from './ExpenseFormFields.jsx';
import ModalShell from './ModalShell.jsx';
import { createExpenseForm } from '../lib/expenseForm.js';

export default function EditExpenseModal({ expense, members, groupId, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(() => createExpenseForm({ members, expense }));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (expense) {
      setForm(createExpenseForm({ members, expense }));
    }
  }, [expense, members]);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  if (!expense) return null;

  const handleSubmit = async (payload) => {
    setSaving(true);
    setError('');

    try {
      const updated = await put(`/api/expenses/${groupId}/${expense.id}`, payload);
      onSave(updated);
      onClose();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Är du säker på att du vill ta bort denna utgift?')) {
      return;
    }

    setSaving(true);
    setError('');
    try {
      await del(`/api/expenses/${groupId}/${expense.id}`);
      onDelete(expense.id);
      onClose();
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      title="Redigera utgift"
      description="Uppdatera detaljerna eller justera fördelningen mellan deltagarna."
      onClose={onClose}
    >
      <ExpenseFormFields
        form={form}
        setForm={setForm}
        members={members}
        error={error}
        saving={saving}
        onCancel={onClose}
        onDelete={handleDelete}
        onError={setError}
        onSubmit={handleSubmit}
        submitLabel="Spara ändringar"
      />
    </ModalShell>
  );
}
