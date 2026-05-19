"use client";

import dynamic from "next/dynamic";

const TestMap = dynamic(() => import("./test-map"), {
  ssr: false,
  loading: () => (
    <p className="flex h-full items-center justify-center text-sm text-neutral-600">
      Chargement de la carte…
    </p>
  ),
});

export default function EditorTestPage() {
  return (
    <main className="h-screen w-full">
      <TestMap />
    </main>
  );
}
