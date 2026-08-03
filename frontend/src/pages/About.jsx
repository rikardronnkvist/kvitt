export default function About() {
  return (
    <div className="mx-auto max-w-[640px] space-y-6">
      <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Kvitt</h1>

      <div className="surface-card flex items-center gap-5 p-5">
        <img src="/kvitt.png" alt="Kvitt" className="h-28 w-28 flex-shrink-0 rounded-2xl shadow-[var(--shadow-soft)]" />
        <p className="text-[var(--text-secondary)]">
          Kvitt är en app för att dela kostnader i grupp – perfekt för resor, delat boende eller gemensamma inköp.
          Lägg till utgifter, se vem som är skyldig vad och registrera betalningar för att hålla koll på ekonomin i dina grupper.
        </p>
      </div>

      <div className="surface-card p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Inloggning</h2>
        <p className="text-[var(--text-secondary)]">
          Kvitt använder passkeys för inloggning – inget lösenord krävs. Passkeys är säkrade med din enhets biometri eller PIN.
        </p>
        <p className="mt-3 text-[var(--text-secondary)]">
          För att inte tappa åtkomsten till ditt konto rekommenderar vi att du sparar dina passkeys i ett lösenordsvalv,
          till exempel <span className="font-medium text-[var(--text-primary)]">iCloud Nyckelring</span>, <span className="font-medium text-[var(--text-primary)]">Google Password Manager</span> eller <span className="font-medium text-[var(--text-primary)]">Bitwarden</span>.
          På så vis kan du logga in från flera enheter och återfå åtkomst om du byter telefon och/eller dator.
        </p>
      </div>
    </div>
  );
}
