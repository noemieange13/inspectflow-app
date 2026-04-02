import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-xl font-semibold">InspectFlow</h1>
      <p className="text-foreground/80 text-center text-sm">
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
      </div>
    </main>
  );
}
