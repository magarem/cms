export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === "/login") return

  const { user, ready, fetchMe, logout } = useAuth()

  if (!ready.value) await fetchMe()

  if (!user.value) {
    const site = to.params.site as string | undefined
    const query: Record<string, string> = {}
    if (site) query.site = site
    if (to.path !== "/") query.redirect = to.fullPath
    return navigateTo({ path: "/login", query })
  }

  const site = to.params.site as string | undefined
  if (!site) return

  // URL site must match the authenticated site (from the JWT).
  // Any mismatch — including admins with wildcard access — is treated as a
  // URL-tampering attempt: clear the session and force re-authentication.
  if (user.value.site !== site) {
    await logout()
  }
})
