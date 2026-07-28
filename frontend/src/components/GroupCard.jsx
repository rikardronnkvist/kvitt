export default function GroupCard({ group, onOpen }) {
  return (
    <button type="button" className="card group-card" onClick={() => onOpen(group.id)}>
      <strong>{group.name}</strong>
      <span>{group.member_count} medlemmar</span>
    </button>
  );
}
