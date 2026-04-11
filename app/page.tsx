import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-xl font-semibold">InspectFlow</h1>
      <p className="text-center text-sm text-foreground/80">
        Ouvrez un rapport via son URL{" "}
        <code className="font-mono">
          /report/&lt;id&gt;?token=&lt;jeton&gt;
        </code>
        .
      </p>
      <div className="flex flex-wrap items-center justify-center gap-4 text-sm">
        <Link href="/report" className="underline">
          Aide — format d’URL
        </Link>
        <Link href="/dashboard" className="underline">
          Statistiques
        </Link>
        {process.env.NODE_ENV === "development" ? (
          <Link href="/dev/reports-pdf" className="text-xs text-foreground/50 underline">
            Dev — test PDF Edge
          </Link>
        ) : null}
      </div>
    </main>
  );
}
