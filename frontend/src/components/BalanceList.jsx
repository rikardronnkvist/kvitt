export default function BalanceList({ balances, nested }) {
  if (!balances.length) {
    return <p>Inga utestående saldon just nu.</p>;
  }

  return (
    <ul className={nested ? 'list-reset' : 'card list-reset'}>
      {balances.map((balance, index) => (
        <li key={`${balance.from.id}-${balance.to.id}-${index}`}>
          {balance.from.username} är skyldig {balance.to.username} {balance.amount.toFixed(2)} SEK
        </li>
      ))}
    </ul>
  );
}
