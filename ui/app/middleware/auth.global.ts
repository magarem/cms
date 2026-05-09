export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === "/login") return

  const { user, ready, fetchMe } = useAuth()

  if (!ready.value) await fetchMe()

  if (!user.value) return navigateTo("/login")

  const site = to.params.site as string | undefined
  if (site) {
    const hasAccess = user.value.sites?.includes("*") || user.value.sites?.includes(site)
    if (!hasAccess) return navigateTo("/login")
  }
})
