import type { DromapProjectStatus } from "@/lib/dromap/product";

const STATUS_CLASSES: Record<DromapProjectStatus, string> = {
  "setup-incomplete": "border-amber-200 bg-amber-50 text-amber-800",
  editing: "border-sky-200 bg-sky-50 text-sky-800",
  unsaved: "border-amber-200 bg-amber-50 text-amber-800",
  saving: "border-teal-200 bg-teal-50 text-teal-800",
  saved: "border-emerald-200 bg-emerald-50 text-emerald-800",
  "sync-pending": "border-teal-200 bg-teal-50 text-teal-800",
  trashed: "border-slate-200 bg-slate-100 text-slate-600",
};

export function DromapStatusBadge({
  status,
  label,
}: {
  status: DromapProjectStatus;
  label: string;
}) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_CLASSES[status]}`}>
      {label}
    </span>
  );
}
