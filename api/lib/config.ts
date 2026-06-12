const DEV_SECRET = "sirius_cms_dev_secret_change_in_production"

export const JWT_SECRET = process.env.JWT_SECRET || DEV_SECRET

if (process.env.NODE_ENV === "production" && JWT_SECRET === DEV_SECRET) {
  console.error("FATAL: JWT_SECRET env var is required in production. Set it in cms.config.cjs or as an environment variable before starting.")
  process.exit(1)
}

if (process.env.NODE_ENV === "production" && JWT_SECRET.length < 32) {
  console.error("FATAL: JWT_SECRET must be at least 32 characters in production.")
  process.exit(1)
}
