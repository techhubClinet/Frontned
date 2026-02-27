import { Router } from 'express'
import { HoldedController } from '../controllers/HoldedController'
import { validateProjectId } from '../middleware/validation'
import { authenticate } from '../middleware/auth'

const router = Router()

// Called by Zapier when an invoice is created in Holded
router.post('/link-invoice', HoldedController.linkInvoice)

// Official Holded invoice for a project (client/admin access)
router.get(
  '/projects/:projectId/invoice',
  validateProjectId,
  authenticate,
  HoldedController.serveHoldedInvoice
)

export default router

