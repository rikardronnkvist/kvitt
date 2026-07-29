function formatDate(value) {
  const date = new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}, ${hours}:${minutes}`;
}

function getInitials(username) {
  return username.slice(0, 2).toUpperCase();
}

export default function ExpenseItem({ expense, onDelete, onEdit }) {
  const uniqueParticipants = Array.from(
    new Map(
      [{ username: expense.paid_by_username }, ...expense.splits].map((item) => [
        item.username,
        item,
      ]),
    ).values(),
  );

  return (
    <article className="expense-row">
      <div className="expense-avatar">{getInitials(expense.paid_by_username)}</div>
      <div className="expense-details">
        <div className="expense-title-row">
          <h3>{expense.title}</h3>
        </div>
        <p className="expense-description">From {expense.paid_by_username} to {expense.splits.map((s) => s.username).join(', ')}</p>
        <p className="expense-date">{formatDate(expense.created_at)}</p>
        {expense.notes ? <p className="expense-notes">{expense.notes}</p> : null}
      </div>
      <div className="expense-amount">
        <span className="amount-value">{expense.currency} {expense.amount.toFixed(0)}</span>
      </div>
      <div className="expense-participants">
        {uniqueParticipants.slice(0, 3).map((participant) => (
          <div key={participant.username} className="participant-avatar" title={participant.username}>
            {getInitials(participant.username)}
          </div>
        ))}
        {uniqueParticipants.length > 3 ? <span className="participant-overflow">+{uniqueParticipants.length - 3}</span> : null}
      </div>
      <div className="expense-actions" style={{ opacity: 0 }}>
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
    </article>
  );
}
