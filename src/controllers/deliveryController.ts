import { Request, Response } from 'express'
import crypto from 'crypto'
import mongoose from 'mongoose'
import { Project } from '../models/Project'
import { getFrontendUrl } from '../config/urls'

const SITE_TITLE = 'KANRI'

/** Vite shield + bolt (same asset as frontend/public/vite.svg) for tab icon when JPEG unavailable. */
const FAVICON_SVG_DATA_URI =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 257"><defs><linearGradient id="g" x1="-.828%" x2="57.636%" y1="7.652%" y2="78.411%"><stop offset="0%" stop-color="#41D1FF"/><stop offset="100%" stop-color="#BD34FE"/></linearGradient><linearGradient id="b" x1="43.376%" x2="50.316%" y1="2.242%" y2="89.03%"><stop offset="0%" stop-color="#FFEA83"/><stop offset="8.333%" stop-color="#FFDD35"/><stop offset="100%" stop-color="#FFA800"/></linearGradient></defs><path fill="url(#g)" d="M255.153 37.938 134.897 252.976c-2.483 4.44-8.862 4.466-11.382.048L.875 37.958c-2.746-4.814 1.371-10.646 6.827-9.67l120.385 21.517a6.537 6.537 0 0 0 2.322-.004l117.867-21.483c5.438-.991 9.574 4.796 6.877 9.62Z"/><path fill="url(#b)" d="M185.432.063 96.44 17.501a3.268 3.268 0 0 0-2.634 3.014l-5.474 92.456a3.268 3.268 0 0 0 3.997 3.378l24.777-5.718c2.318-.535 4.413 1.507 3.936 3.838l-7.361 36.047c-.495 2.426 1.782 4.5 4.151 3.78l15.304-4.649c2.372-.72 4.652 1.36 4.15 3.788l-11.698 56.621c-.732 3.542 3.979 5.473 5.943 2.437l1.313-2.028 72.516-144.72c1.215-2.423-.88-5.186-3.54-4.672l-25.505 4.922c-2.396.462-4.435-1.77-3.759-4.114l16.646-57.705c.677-2.35-1.37-4.583-3.769-4.113Z"/></svg>'
  )

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function isValidRedirectUrl(value: string): boolean {
  try {
    const trimmed = value.trim()
    if (!/^https?:\/\/\S+$/i.test(trimmed)) return false
    // Reject values that contain another scheme marker after protocol (e.g. https://ht!tp://broken)
    const firstSchemeIdx = trimmed.indexOf('://')
    if (trimmed.indexOf('://', firstSchemeIdx + 3) !== -1) return false

    const parsed = new URL(value)
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      Boolean(parsed.hostname)
    )
  } catch {
    return false
  }
}

function normalizeRedirectUrl(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (isValidRedirectUrl(trimmed)) return trimmed
  // Backward-compat for older records saved without protocol.
  const withHttps = `https://${trimmed}`
  if (isValidRedirectUrl(withHttps)) return withHttps
  return null
}

function renderRedirectFailedPage(message: string): string {
  const frontend = getFrontendUrl()
  const logoUrl = `${frontend}/logo.jpeg`
  const safeMessage = escapeHtml(message)
  const safeLogo = escapeHtml(logoUrl)
  const safeFrontend = escapeHtml(frontend)
  const safeSiteTitle = escapeHtml(SITE_TITLE)

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeSiteTitle} · Delivery link</title>
    <link rel="icon" href="${FAVICON_SVG_DATA_URI}" type="image/svg+xml" />
    <link rel="alternate icon" href="${safeLogo}" />
    <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        background: #f1f5f9;
        color: #0f172a;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1.5rem;
      }
      .card {
        background: #fff;
        border-radius: 12px;
        box-shadow: 0 4px 24px rgba(15, 23, 42, 0.08);
        max-width: 28rem;
        width: 100%;
        padding: 2rem;
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        margin-bottom: 1.5rem;
        text-decoration: none;
        color: inherit;
      }
      .brand img {
        width: 40px;
        height: 40px;
        object-fit: contain;
        border-radius: 8px;
      }
      .brand span {
        font-size: 1.25rem;
        font-weight: 700;
        letter-spacing: -0.02em;
      }
      h1 {
        font-size: 1.125rem;
        font-weight: 600;
        margin: 0 0 0.75rem;
      }
      p {
        margin: 0;
        line-height: 1.55;
        color: #475569;
        font-size: 0.9375rem;
      }
      .home {
        display: inline-block;
        margin-top: 1.25rem;
        font-size: 0.875rem;
        color: #2563eb;
        text-decoration: none;
        font-weight: 500;
      }
      .home:hover { text-decoration: underline; }
    </style>
  </head>
  <body>
    <div class="card">
      <a class="brand" href="${safeFrontend}/" title="${safeSiteTitle}">
        <img src="${safeLogo}" alt="${safeSiteTitle}" width="40" height="40" />
        <span>${safeSiteTitle}</span>
      </a>
      <h1>Redirect unavailable</h1>
      <p>${safeMessage}</p>
      <a class="home" href="${safeFrontend}/">${safeSiteTitle} — Home</a>
    </div>
  </body>
</html>`
}

/**
 * GET /delivery/:token
 * Public route (no auth). Finds project by deliveryToken and redirects (302) to the original deliveryUrl.
 * Returns 404 if token not found. Optional: only allow when isDelivered is true.
 */
export async function deliveryRedirect(req: Request, res: Response): Promise<void> {
  try {
    const id = (req.params.id || req.params.token || '').trim()
    console.info('[Delivery] requested id:', id || '(empty)')

    if (!id) {
      res.status(404).send('Not found')
      return
    }

    let project = await Project.findOne({ deliveryToken: id })
    // Support direct DB project id links as fallback for legacy links.
    if (!project && mongoose.Types.ObjectId.isValid(id)) {
      project = await Project.findById(id)
    }

    if (!project || !project.deliveryUrl) {
      console.warn('[Delivery] id not found or missing URL:', id)
      res.status(404).send('Not found')
      return
    }

    const redirectUrl = normalizeRedirectUrl(project.deliveryUrl)
    if (!redirectUrl) {
      console.error('[Delivery] invalid stored redirect URL:', {
        id,
        rawDeliveryUrl: project.deliveryUrl,
      })
      res.status(404).send('Not found')
      return
    }

    console.info('[Delivery] redirecting:', { id, redirectUrl })
    res.redirect(302, redirectUrl)
  } catch (err: any) {
    const id = (req.params.id || req.params.token || '').trim()
    console.error('[Delivery] redirect error:', {
      id,
      message: err?.message,
    })
    res
      .status(500)
      .type('html')
      .send(renderRedirectFailedPage('We could not open this delivery link right now. Please try again later.'))
  }
}

/**
 * Generate a secure random token for masked delivery links (at least 32 chars).
 */
export function generateDeliveryToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

export function normalizeAndValidateDeliveryUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  if (!normalized || !isValidRedirectUrl(normalized)) return null
  return normalized
}
