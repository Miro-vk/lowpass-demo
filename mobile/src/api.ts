const BASE_URL = "https://lowpass-demo.onrender.com";

async function request(path: string, token?: string, options: RequestInit = {}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Request failed");
  }
  if (res.status === 204) return null;
  return res.json();
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
