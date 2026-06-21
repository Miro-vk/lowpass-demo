const BASE_URL = "https://lowpass-demo.onrender.com";

// Digest takes time (multiple LLM calls); other endpoints just need to survive cold start.
const TIMEOUT_MS: Record<string, number> = {
  "/digest": 180_000, // 3 min
  default: 60_000,    // 1 min — enough for Render cold start (~30s) + response
};

async function request(path: string, token?: string, options: RequestInit = {}) {
  const timeout = TIMEOUT_MS[path] ?? TIMEOUT_MS.default;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || "Request failed");
    }
    if (res.status === 204) return null;
    return res.json();
  } catch (e: any) {
    if (e.name === "AbortError") throw new Error("Request timed out — the server may be waking up, try again in a moment.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  signup: (email: string, password: string) =>
    request("/auth/signup", undefined, {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  login: (email: string, password: string): Promise<{ access_token: string }> =>
    request("/auth/login", undefined, {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  getTopics: (token: string) => request("/topics", token),

  addTopic: (token: string, query: string, focus: string) =>
    request("/topics", token, {
      method: "POST",
      body: JSON.stringify({ query, focus }),
    }),

  deleteTopic: (token: string, id: string) =>
    request(`/topics/${id}`, token, { method: "DELETE" }),

  runDigest: (token: string) =>
    request("/digest", token, { method: "POST" }),
};
