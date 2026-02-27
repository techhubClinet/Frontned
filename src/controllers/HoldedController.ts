import { Request, Response } from 'express'
import { Project } from '../models/Project'
import { ApiResponse } from '../views/response'
import { getHoldedDocument, getHoldedDocumentPdf } from '../services/holdedService'
import { AuthRequest } from '../middleware/auth'

export class HoldedController {
  // Called from Zapier when an invoice is created in Holded
  static async linkInvoice(req: Request, res: Response) {
    try {
      const { projectId, holded_document_id } = req.body as {
        projectId?: string
        holded_document_id?: string
      }

      if (!projectId || !holded_document_id) {
        return ApiResponse.error(res, 'projectId and holded_document_id are required', 400)
      }

      const project = await Project.findByIdAndUpdate(
        projectId,
        { holded_document_id, holded_invoice_status: 'draft' },
        { new: true }
      )

      if (!project) {
        return ApiResponse.notFound(res, 'Project not found')
      }

      return ApiResponse.success(res, project, 'Holded invoice linked to project')
    } catch (err: any) {
      return ApiResponse.error(res, err?.message || 'Failed to link Holded invoice', 500)
    }
  }

  // Stream official Holded invoice PDF to the browser once approved
  static async serveHoldedInvoice(req: Request, res: Response) {
    try {
      const { projectId } = req.params

      const project = await Project.findById(projectId)
      if (!project) {
        return ApiResponse.notFound(res, 'Project not found')
      }

      // Basic access control: client must own the project; admin/collaborator can always view
      const authReq = req as AuthRequest
      if (authReq.user?.role === 'client') {
        const projectEmail = (project.client_email || '').toLowerCase()
        const userEmail = (authReq.user.email || '').toLowerCase()
        const isOwner = projectEmail && projectEmail === userEmail
        if (!isOwner) {
          return ApiResponse.error(res, 'You do not have access to this project', 403)
        }
      }

      if (!project.holded_document_id) {
        return ApiResponse.error(res, 'No Holded invoice linked to this project', 400)
      }

      if (project.payment_status !== 'paid') {
        return ApiResponse.error(res, 'Invoice available only after payment is completed', 403)
      }

      // Refresh status from Holded (API: 0 = draft?, 1 = approved, 2 = approved in some docs)
      const doc = await getHoldedDocument(project.holded_document_id)
      const status = doc.status
      console.log('[Holded] Document status for', project.holded_document_id, ':', status)

      const isApproved = status === 1 || status === 2
      project.holded_invoice_status = isApproved ? 'approved' : status === 0 ? 'draft' : String(status)
      await project.save().catch(() => {})

      if (!isApproved) {
        return ApiResponse.error(res, `Invoice not approved yet in Holded (status: ${status}). Approve it in Holded first.`, 403)
      }

      const pdfBuffer = await getHoldedDocumentPdf(project.holded_document_id)
      const isPdf = pdfBuffer.length >= 4 && pdfBuffer.toString('ascii', 0, 4) === '%PDF'
      console.log('[Holded] PDF buffer length:', pdfBuffer.length, 'starts with %PDF:', isPdf)

      if (!isPdf) {
        return ApiResponse.error(res, 'Holded did not return a valid PDF', 502)
      }

      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', 'inline; filename=\"holded-invoice.pdf\"')
      res.setHeader('Content-Length', pdfBuffer.length.toString())
      res.send(pdfBuffer)
    } catch (err: any) {
      return ApiResponse.error(res, err?.message || 'Failed to load Holded invoice', 500)
    }
  }
}

