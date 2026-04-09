export async function POST(req: Request) {
  try {
    console.log("API HIT ✅");

    // 🔍 Vérifier content-type
    const contentType = req.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      return new Response(
        JSON.stringify({ error: "Invalid content-type" }),
        { status: 400 }
      );
    }

    // 📦 Lire le body
    const body = await req.json();
    console.log("BODY RECEIVED:", body);

    const { id, html } = body;

    // ❌ Validation simple
    if (!id) {
      return new Response(
        JSON.stringify({ error: "Missing id" }),
        { status: 400 }
      );
    }

    if (!html) {
      return new Response(
        JSON.stringify({ error: "Missing html" }),
        { status: 400 }
      );
    }

    // ✅ Simulation traitement (plus tard PDF / Supabase ici)
    console.log("PROCESSING REPORT:", id);

    // ✅ Réponse clean
    return new Response(
      JSON.stringify({
        success: true,
        message: "Inspection processed",
        id,
      }),
      { status: 200 }
    );

  } catch (err: any) {
    console.error("ERROR:", err);

    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: err?.message || null,
      }),
      { status: 500 }
    );
  }
}