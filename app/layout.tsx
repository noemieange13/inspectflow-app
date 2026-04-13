import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "InspectFlow — Rapports d'inspection automatisés",
    template: "%s | InspectFlow",
  },
  description:
    "Générez des rapports d'inspection de bâtiments professionnels, bilingues (FR/EN), conformes aux pratiques canadiennes. PDF sécurisé, IA intégrée, zéro rédaction.",
  keywords: [
    "inspection bâtiment",
    "rapport inspection",
    "Canada",
    "CNB",
    "building inspection",
    "PDF",
    "bilingue",
  ],
  openGraph: {
    title: "InspectFlow — Rapports d'inspection automatisés",
    description:
      "Rapports professionnels bilingues FR/EN. Conforme aux pratiques canadiennes. PDF sécurisé.",
    type: "website",
    locale: "fr_CA",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
