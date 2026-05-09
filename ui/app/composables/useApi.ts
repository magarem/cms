export function useApi() {
  const config = useRuntimeConfig()
  const base = config.public.apiBase as string

  async function request<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
    const res = await fetch(`${base}${path}`, {
      credentials: "include",
      headers: { "Content-Type": "application/json", ...opts.headers },
      ...opts,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw Object.assign(new Error(err.error || "API error"), { status: res.status, data: err })
    }
    return res.json()
  }

  return {
    get: <T = any>(path: string) => request<T>(path),
    post: <T = any>(path: string, body?: unknown) =>
      request<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined }),
    put: <T = any>(path: string, body?: unknown) =>
      request<T>(path, { method: "PUT", body: body !== undefined ? JSON.stringify(body) : undefined }),
    del: <T = any>(path: string) => request<T>(path, { method: "DELETE" }),
  }
}
