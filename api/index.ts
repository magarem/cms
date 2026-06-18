import { Elysia } from "elysia"
import { cors } from "@elysiajs/cors"
import { authRoutes } from "./routes/auth"
import { sitesRoutes } from "./routes/sites"
import { usersRoutes } from "./routes/users"
import { modelsRoutes } from "./routes/models"
import { agentRoutes } from "./routes/agent"
import { backupsRoutes } from "./routes/backups"
import { clientsRoutes } from "./routes/clients"
import { productsRoutes } from "./routes/products"
import { settingsRoutes } from "./routes/settings"
import { publicRoutes } from "./routes/public"
import { controlRoutes } from "./routes/control"
import { messagesRoutes } from "./routes/messages"

const PORT           = Number(process.env.PORT || 3002)
const UI_ORIGIN      = process.env.CMS_UI_URL   || "http://localhost:3001"
const PORTAL_ORIGIN  = process.env.PORTAL_URL   || "http://localhost:3003"
const CONTROL_ORIGIN = process.env.CONTROL_URL  || "http://localhost:3004"
const IS_PROD        = process.env.NODE_ENV === "production"

const allowedOrigins = IS_PROD
  ? [UI_ORIGIN, PORTAL_ORIGIN, CONTROL_ORIGIN]
  : [UI_ORIGIN, PORTAL_ORIGIN, CONTROL_ORIGIN, /^http:\/\/localhost:\d+$/]

const app = new Elysia()
  .use(
    cors({
      origin: allowedOrigins,
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
  .use(clientsRoutes)
  .use(productsRoutes)
  .use(settingsRoutes)
  .use(publicRoutes)
  .use(controlRoutes)
  .use(messagesRoutes)
  .listen(PORT)

console.log(`🚀 Sirius CMS API running at http://localhost:${PORT}`)
