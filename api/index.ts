import { Elysia } from "elysia"
import { cors } from "@elysiajs/cors"
import { authRoutes } from "./routes/auth"
import { sitesRoutes } from "./routes/sites"
import { usersRoutes } from "./routes/users"

const PORT = Number(process.env.PORT || 3002)
const UI_ORIGIN = process.env.CMS_UI_URL || "http://localhost:3001"

const app = new Elysia()
  .use(
    cors({
      origin: true,
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization"],
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    })
  )
  .get("/health", () => ({ status: "ok", ts: new Date().toISOString() }))
  .use(authRoutes)
  .use(sitesRoutes)
  .use(usersRoutes)
  .listen(PORT)

console.log(`🚀 Sirius CMS API running at http://localhost:${PORT}`)
