export function DromapPageSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div className="min-h-screen bg-[#f7f9f8] px-6 py-8" aria-hidden="true">
      <div className={`mx-auto w-full ${compact ? "max-w-md" : "max-w-6xl"}`}>
        <div className="flex items-center gap-3">
          <div className="dromap-skeleton h-12 w-12 rounded-2xl" />
          <div className="space-y-2">
            <div className="dromap-skeleton h-4 w-28 rounded-md" />
            <div className="dromap-skeleton h-3 w-40 rounded-md" />
          </div>
        </div>
        <div className={`mt-8 grid gap-4 ${compact ? "grid-cols-1" : "md:grid-cols-3"}`}>
          <div className={`${compact ? "h-72" : "h-64 md:col-span-2"} dromap-skeleton rounded-2xl`} />
          {!compact ? <div className="dromap-skeleton h-64 rounded-2xl" /> : null}
        </div>
        {!compact ? (
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="dromap-skeleton h-28 rounded-2xl" />
            <div className="dromap-skeleton h-28 rounded-2xl" />
            <div className="dromap-skeleton h-28 rounded-2xl" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
