/**
 * Résumé client optionnel via OpenAI (serveur uniquement).
 */

export async function generateSummary(data: unknown): Promise<string> {
  if (!process.env.OPENAI_API_KEY) return "";

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: `Fais un résumé client clair:\n${JSON.stringify(data)}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[openai summary]", res.status, errText.slice(0, 2000));
    return "";
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return json.choices?.[0]?.message?.content ?? "";
}
