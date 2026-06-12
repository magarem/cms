import { Elysia } from "elysia"
import { cors } from "@elysiajs/cors"
import { authRoutes } from "./routes/auth"
import { sitesRoutes } from "./routes/sites"
import { usersRoutes } from "./routes/users"
import { modelsRoutes } from "./routes/models"
import { agentRoutes } from "./routes/agent"
import { backupsRoutes } from "./routes/backups"

const PORT = Number(process.env.PORT || 3002)
const UI_ORIGIN = process.env.CMS_UI_URL || "http://localhost:3001"
const IS_PROD = process.env.NODE_ENV === "production"

const app = new Elysia()
  .use(
    cors({
      origin: IS_PROD ? UI_ORIGIN : [UI_ORIGIN, /^http:\/\/localhost:\d+$/],
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization"],
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    })
  )
  .get("/health", () => ({ status: "ok", ts: new Date().toISOString() }))
  .use(authRoutes)
  .use(sitesRoutes)
  .use(modelsRoutes)
  .use(usersRoutes)
  .use(agentRoutes)
  .use(backupsRoutes)
  .listen(PORT)

console.log(`🚀 Sirius CMS API running at http://localhost:${PORT}`)
