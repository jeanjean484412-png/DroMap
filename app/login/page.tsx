import { Suspense } from "react";
import { DromapLoginClient } from "@/components/dromap-product/login-client";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center bg-slate-50 text-sm text-slate-600">Chargement…</div>}>
      <DromapLoginClient />
    </Suspense>
  );
}
