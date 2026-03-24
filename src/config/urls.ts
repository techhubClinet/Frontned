const DEFAULT_FRONTEND_DEPLOYED = 'https://www.kanridesign.com'
const DEFAULT_FRONTEND_DEPLOYED_NO_WWW = 'https://kanridesign.com'
const DEFAULT_FRONTEND_LOCAL = 'http://localhost:5173'

const normalize = (url: string) => url.replace(/\/$/, '')

const isProduction = process.env.NODE_ENV === 'production'
const forceLocalFrontend = process.env.FORCE_LOCAL_FRONTEND === 'true'

export function getFrontendUrl(): string {
  const local = process.env.FRONTEND_URL_LOCAL
  const deployed = process.env.FRONTEND_URL_DEPLOYED
  const legacy = process.env.FRONTEND_URL

  const selected = forceLocalFrontend
    ? (local || DEFAULT_FRONTEND_LOCAL)
    : isProduction
    ? (deployed || legacy || DEFAULT_FRONTEND_DEPLOYED)
    : (local || deployed || legacy || DEFAULT_FRONTEND_LOCAL)

  return normalize(selected)
}

export function getFrontendUrlNoWww(): string {
  return normalize(
    process.env.FRONTEND_URL_NO_WWW ||
    process.env.FRONTEND_URL_DEPLOYED_NO_WWW ||
    DEFAULT_FRONTEND_DEPLOYED_NO_WWW
  )
}
