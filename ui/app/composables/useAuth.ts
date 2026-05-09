interface AuthUser {
  id: string
  username: string
  role: "admin" | "editor" | "viewer"
  site: string
  sites: string[]
}

export function useAuth() {
  const user = useState<AuthUser | null>("auth:user", () => null)
  const ready = useState<boolean>("auth:ready", () => false)
  const api = useApi()

  async function fetchMe() {
    try {
      const data = await api.get<{ success: boolean; user: AuthUser }>("/auth/me")
      if (data.success) user.value = data.user
      else user.value = null
    } catch {
      user.value = null
    } finally {
      ready.value = true
    }
  }

  async function login(site: string, username: string, password: string) {
    const data = await api.post<{ success: boolean; user: AuthUser; error?: string }>("/auth/login", {
      site,
      username,
      password,
    })
    if (data.success) {
      user.value = data.user
      ready.value = true
    }
    return data
  }

  async function logout() {
    await api.post("/auth/logout").catch(() => {})
    user.value = null
    await navigateTo("/login")
  }

  return { user, ready, fetchMe, login, logout }
}
