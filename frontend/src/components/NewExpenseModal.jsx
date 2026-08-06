import { useEffect, useState } from 'react';
import { post } from '../api/client.js';
import ExpenseFormFields from './ExpenseFormFields.jsx';
import ModalShell from './ModalShell.jsx';
import { createExpenseForm } from '../lib/expenseForm.js';
import { getCurrentUserId } from '../lib/session.js';
import { t } from '../lib/i18n.js';

export default function NewExpenseModal({ groupId, members, categories, mileageRate, defaultPaidByUserId, onClose, onSuccess }) {
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => createExpenseForm({
    members,
    categories,
    currentUserId: getCurrentUserId(),
    defaultPaidByUserId,
  }));

  useEffect(() => {
    setForm(createExpenseForm({
      members,
      categories,
      currentUserId: getCurrentUserId(),
      defaultPaidByUserId,
    }));
  }, [members, categories, defaultPaidByUserId]);

  const handleClose = () => {
    const isDirty = form.title.trim() !== '' || (form.amount !== '' && form.amount !== '0') || form.notes.trim() !== '';
    if (isDirty && !window.confirm(t('expenseModals.discardConfirm'))) return;
    onClose();
  };

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [handleClose]);

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
      title={t('expenseModals.newTitle')}
      description={t('expenseModals.newDescription')}
      onClose={handleClose}
    >
      <ExpenseFormFields
        form={form}
        setForm={setForm}
        members={members}
        categories={categories}
        mileageRate={mileageRate}
        error={error}
        saving={saving}
        onCancel={handleClose}
        onError={setError}
        onSubmit={handleSubmit}
        submitLabel={t('expenseModals.saveExpense')}
      />
    </ModalShell>
  );
}
