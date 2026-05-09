export default defineNuxtConfig({
  compatibilityDate: "2024-11-01",
  future: { compatibilityVersion: 4 },
  ssr: false,
  modules: ["@nuxt/ui"],
  css: ["~/assets/css/main.css"],

  components: {
    dirs: [{ path: "~/components", pathPrefix: false }],
  },

  runtimeConfig: {
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE || "http://localhost:3002",
    },
  },

  app: {
    head: {
      title: "Sirius CMS",
      link: [{ rel: "icon", type: "image/x-icon", href: "/favicon.ico" }],
    },
  },
})
