function formatDate(value) {
  return new Date(value).toLocaleString('sv-SE');
}

export default function ExpenseItem({ expense, onDelete, onEdit }) {
  return (
    <article className="card expense-item">
      <div className="expense-header">
        <div>
          <h3>{expense.title}</h3>
          <p>{expense.amount.toFixed(2)} {expense.currency}</p>
          <p>Betald av {expense.paid_by_username}</p>
          <p>{formatDate(expense.created_at)}</p>
          {expense.notes ? <p>{expense.notes}</p> : null}
        </div>
        <div className="expense-actions">
          {onEdit ? (
            <button type="button" onClick={() => onEdit(expense.id)}>
              Redigera
            </button>
          ) : null}
          {onDelete ? (
            <button type="button" className="danger" onClick={() => onDelete(expense.id)}>
              Ta bort
            </button>
          ) : null}
        </div>
      </div>
      <ul>
        {expense.splits.map((split) => (
          <li key={split.id ?? `${expense.id}-${split.user_id}`}>
            {split.username}: {split.amount_owed.toFixed(2)} {expense.currency}
          </li>
        ))}
      </ul>
    </article>
  );
}
