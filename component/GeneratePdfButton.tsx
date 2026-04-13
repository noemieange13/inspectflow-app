"use client";

import { useState } from "react";

export default function GeneratePdfButton({ reportId }: { reportId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    try {
      setLoading(true);
      setError(null);

      // 👉 HTML TEST (tu remplaceras plus tard)
      const html = `
        <html>
          <body>
            <h1>Report ${reportId}</h1>
            <p>PDF généré avec succès</p>
          </body>
        </html>
      `;

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/report-pdf`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            html,
            report_id: reportId,
          }),
        }
      );

      // 🔥 check important
      const text = await res.text();
      console.log("RAW RESPONSE 👉", text);

      if (!res.ok) {
        throw new Error(text);
      }

      const data = JSON.parse(text);
      console.log("SUCCESS 👉", data);

      // 👉 ouvre le PDF
      window.open(data.pdf_url, "_blank");
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button onClick={handleClick} disabled={loading}>
        {loading ? "Génération..." : "Générer PDF"}
      </button>

      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
}