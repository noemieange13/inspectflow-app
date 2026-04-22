import type { Metadata } from "next";
import Link from "next/link";

import ProductInsightsClient from "./ProductInsightsClient";

export const metadata: Metadata = {
  title: "Product insights — InspectFlow",
};

export default function ProductInsightsPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="border-b border-slate-200 bg-white px-4 py-3 text-sm">
        <Link href="/" className="text-blue-600 hover:underline">
          Accueil
        </Link>
        <span className="mx-2 text-slate-400">/</span>
        <span className="text-slate-700">Dev — product insights</span>
      </nav>
      <ProductInsightsClient />
    </div>
  );
}
