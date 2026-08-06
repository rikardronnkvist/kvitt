import { useEffect, useState } from 'react';
import { del, put } from '../api/client.js';
import ExpenseFormFields from './ExpenseFormFields.jsx';
import ModalShell from './ModalShell.jsx';
import { createExpenseForm } from '../lib/expenseForm.js';
import { t } from '../lib/i18n.js';

export default function EditExpenseModal({ expense, members, categories, mileageRate, groupId, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(() => createExpenseForm({ members, categories, expense }));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (expense) {
      setForm(createExpenseForm({ members, categories, expense }));
    }
  }, [expense, members, categories]);

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
    if (!window.confirm(t('expenseModals.editDeleteConfirm'))) {
      return;
    }

    setSaving(true);
    setError('');
    try {
      await del(`/api/expenses/${groupId}/${expense.id}`);
      await onDelete(expense.id);
      onClose();
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      title={t('expenseModals.editTitle')}
      description={t('expenseModals.editDescription')}
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
        onDelete={handleDelete}
        onError={setError}
        onSubmit={handleSubmit}
        submitLabel={t('expenseModals.saveChanges')}
      />
    </ModalShell>
  );
}
