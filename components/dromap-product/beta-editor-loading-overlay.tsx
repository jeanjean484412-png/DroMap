export function BetaEditorLoadingOverlay() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[12000] grid place-items-center bg-slate-950/55 p-5"
    >
      <div className="w-full max-w-md rounded-2xl border border-[#348279]/30 bg-[#f7f8f1] p-7 text-center text-[#1c4355] shadow-2xl sm:p-9">
        <div className="mx-auto mb-5 size-9 animate-spin rounded-full border-4 border-[#348279]/20 border-t-[#348279]" aria-hidden="true" />
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#348279]">Version bêta</p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight">Préparation de votre carte</h2>
        <p className="mt-4 text-sm leading-6 text-[#52616a]">
          Des lenteurs peuvent survenir au chargement de la carte. L’éditeur et la carte se préparent en arrière-plan.
        </p>
      </div>
    </div>
  );
}
