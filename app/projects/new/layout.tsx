import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Nouveau projet",
  description: "Créez un nouveau projet DroMap et préparez sa carte avant de commencer l’édition.",
};

export default function NewProjectLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
