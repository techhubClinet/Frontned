import { Request, Response } from 'express'
import crypto from 'crypto'
import mongoose from 'mongoose'
import { Project } from '../models/Project'

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
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Redirect failed</title>
  </head>
  <body>
    <h1>Redirect unavailable</h1>
    <p>${message}</p>
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
    const id = (req.params.token || '').trim()
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
