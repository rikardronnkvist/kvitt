export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="surface-card flex flex-col items-start gap-4 p-6">
      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[var(--app-surface-muted)] text-[var(--text-secondary)]">
        <Icon className="h-5 w-5" />
      </div>
      <div className="space-y-1">
        <h3 className="m-0 text-base font-semibold">{title}</h3>
        <p className="m-0 max-w-md text-sm text-[var(--text-secondary)]">{description}</p>
      </div>
      {action}
    </div>
  );
}
