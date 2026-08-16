import { Suspense } from "react";
import { DromapSignupClient } from "@/components/dromap-product/signup-client";

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center bg-slate-50 text-sm text-slate-600">Chargement…</div>}>
      <DromapSignupClient />
    </Suspense>
  );
}
