export async function apiFetch<T = unknown>(
  url: string,
  options?: RequestInit
): Promise<{ data: T; error?: string }> {
  try {
    const res = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...(options?.headers || {})
      },
      ...options
    })

    if (!res.ok) {
      return {
        data: [] as T,
        error: `HTTP ${res.status}`
      }
    }

    const json = await res.json()

    return {
      data: json?.data ?? ([] as T),
      error: json?.error
    }

  } catch (err) {
    console.error("apiFetch error:", err)

    return {
      data: [] as T,
      error: "Network error"
    }
  }
}