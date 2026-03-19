import { Request, Response } from 'express'
import crypto from 'crypto'
import { Project } from '../models/Project'

/**
 * GET /delivery/:token
 * Public route (no auth). Finds project by deliveryToken and redirects (302) to the original deliveryUrl.
 * Returns 404 if token not found. Optional: only allow when isDelivered is true.
 */
export async function deliveryRedirect(req: Request, res: Response): Promise<void> {
  try {
    const { token } = req.params
    if (!token || token.length < 16) {
      res.status(404).send('Not found')
      return
    }

    const project = await Project.findOne({ deliveryToken: token })
    if (!project || !project.deliveryUrl) {
      res.status(404).send('Not found')
      return
    }

    if (!project.isDelivered) {
      res.status(404).send('Not found')
      return
    }

    res.redirect(302, project.deliveryUrl)
  } catch (err: any) {
    console.error('[Delivery] redirect error:', err?.message)
    res.status(500).send('Error')
  }
}

/**
 * Generate a secure random token for masked delivery links (at least 32 chars).
 */
export function generateDeliveryToken(): string {
  return crypto.randomBytes(32).toString('hex')
}
