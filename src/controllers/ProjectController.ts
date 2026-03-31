import { Request, Response } from 'express'
import { Project } from '../models/Project'
import { ApiResponse } from '../views/response'
import { AuthRequest } from '../middleware/auth'
import { sendCollaboratorProjectAssignedEmail } from '../services/emailService'
import { getHoldedDocument, getHoldedInvoiceStatus } from '../services/holdedService'
import { generateDeliveryToken, normalizeAndValidateDeliveryUrl } from './deliveryController'

// Base URL for masked delivery links (used in status_notes and in API response for client)
const BACKEND_PORT = process.env.PORT || '3001'
const DEFAULT_DELIVERY_BASE_URL =
  process.env.DELIVERY_PUBLIC_URL ||
  process.env.BACKEND_PUBLIC_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
  (process.env.NODE_ENV !== 'production' ? `http://localhost:${BACKEND_PORT}` : '')

function resolveDeliveryBaseUrl(req?: Request): string {
  if (process.env.DELIVERY_PUBLIC_URL) return process.env.DELIVERY_PUBLIC_URL
  if (process.env.BACKEND_PUBLIC_URL) return process.env.BACKEND_PUBLIC_URL
  const host = req?.get?.('host')
  const proto = (req?.headers?.['x-forwarded-proto'] as string) || req?.protocol
  if (host && proto) return `${proto}://${host}`
  return DEFAULT_DELIVERY_BASE_URL
}

/** Strip private deliveryUrl from project for client; add deliveryMaskedLink when deliveryToken exists. */
function sanitizeProjectForClient(project: any, req?: Request): any {
  const p = project.toObject ? project.toObject() : { ...project }
  delete p.deliveryUrl
  const baseUrl = resolveDeliveryBaseUrl(req)
  if (p.deliveryToken && baseUrl) {
    p.deliveryMaskedLink = `${baseUrl.replace(/\/$/, '')}/delivery/${p.deliveryToken}`
  }
  return p
}

export class ProjectController {
  // Get project by ID (for client link validation)
  static async getProject(req: Request, res: Response) {
    try {
      const { projectId } = req.params
      const project = await Project.findById(projectId)

      if (!project) {
        return ApiResponse.notFound(res, 'Project not found or invalid link')
      }

      // Client role: allow access if they own the project OR project is unclaimed/unpaid (so they can start purchase flow)
      const authReq = req as AuthRequest
      if (authReq.user?.role === 'client') {
        const projectEmail = (project.client_email || '').toLowerCase()
        const userEmail = (authReq.user.email || '').toLowerCase()
        const isOwner = projectEmail && projectEmail === userEmail
        const isUnclaimedOrUnpaid = !projectEmail || project.payment_status !== 'paid'
        if (!isOwner && !isUnclaimedOrUnpaid) {
          return ApiResponse.error(res, 'You do not have access to this project', 403)
        }
      }

      // Client: do not expose deliveryUrl; expose deliveryMaskedLink when deliveryToken exists
      if (authReq.user?.role === 'client') {
        return ApiResponse.success(res, sanitizeProjectForClient(project, req), 'Project retrieved successfully')
      }

      return ApiResponse.success(res, project, 'Project retrieved successfully')
    } catch (error: any) {
      return ApiResponse.error(res, error.message, 500)
    }
  }

  // Update project service selection
  static async updateServiceSelection(req: Request, res: Response) {
    try {
      const { projectId } = req.params
      const { serviceId, customAmount } = req.body

      // Verify project exists
      const project = await Project.findById(projectId)

      if (!project) {
        return ApiResponse.notFound(res, 'Project not found')
      }

      // Update project with service selection
      const updateData: any = {}

      if (serviceId) {
        updateData.selected_service = serviceId
      } else if (customAmount) {
        updateData.custom_quote_amount = customAmount
      }

      const updatedProject = await Project.findByIdAndUpdate(
        projectId,
        updateData,
        { new: true }
      )

      return ApiResponse.success(res, updatedProject, 'Service selection updated')
    } catch (error: any) {
      return ApiResponse.error(res, error.message, 500)
    }
  }

  // Get project with full details (for client dashboard)
  static async getProjectDetails(req: Request, res: Response) {
    try {
      const { projectId } = req.params

      const project = await Project.findById(projectId)
        .populate('selected_service')
        .populate('assigned_collaborator', 'first_name last_name')
        .populate('custom_quote_request', 'description')

      if (!project) {
        return ApiResponse.notFound(res, 'Project not found')
      }

      // Client role: allow access if they own the project OR project is unclaimed/unpaid (so they can start purchase flow)
      const authReq = req as AuthRequest
      if (authReq.user?.role === 'client') {
        const projectEmail = (project.client_email || '').toLowerCase()
        const userEmail = (authReq.user.email || '').toLowerCase()
        const isOwner = projectEmail && projectEmail === userEmail
        const isUnclaimedOrUnpaid = !projectEmail || project.payment_status !== 'paid'
        if (!isOwner && !isUnclaimedOrUnpaid) {
          return ApiResponse.error(res, 'You do not have access to this project', 403)
        }
      }

      // Get briefing
      const { ProjectBriefing } = await import('../models/Briefing')
      const briefing = await ProjectBriefing.findOne({ project_id: projectId })

      // Refresh Holded invoice status so client sees "View invoice" only when approved
      if (project.holded_document_id && project.payment_status === 'paid') {
        try {
          const doc = await getHoldedDocument(project.holded_document_id)
          project.holded_invoice_status = getHoldedInvoiceStatus(doc)
          await project.save().catch(() => {})
          console.log('[Holded] Project details refresh:', project.holded_document_id, 'status from API:', doc?.status, 'docNumber:', doc?.docNumber, '→', project.holded_invoice_status)
        } catch (e) {
          console.warn('[Holded] Failed to refresh invoice status:', (e as Error)?.message)
          project.holded_invoice_status = 'draft'
          await project.save().catch(() => {})
        }
      }

      // Get briefing images
      const { BriefingImage } = await import('../models/Briefing')
      const images = await BriefingImage.find({ project_id: projectId }).sort({ order: 1 })

      // Format images for response
      const formattedImages = images.map((img: any) => ({
        _id: img._id,
        id: img._id,
        url: img.image_url,
        notes: img.notes,
        order: img.order,
      }))

      const projectPayload = authReq.user?.role === 'client' ? sanitizeProjectForClient(project, req) : project

      return ApiResponse.success(res, {
        project: projectPayload,
        briefing: briefing || null,
        images: formattedImages || [],
      })
    } catch (error: any) {
      return ApiResponse.error(res, error.message, 500)
    }
  }

  // Create new project (admin)
  static async createProject(req: Request, res: Response) {
    try {
      const { name, client_name, client_email, project_type, service, service_price, service_price_eur, service_description, amount, deadline, delivery_timeline, max_revisions, selected_service_id: selectedServiceId } = req.body

      if (!name) {
        return ApiResponse.error(res, 'Project name is required', 400)
      }

      const projectData: any = {
        name,
        client_name: client_name || 'Client', // Default client name if not provided
        client_email: client_email || undefined,
        project_type: project_type || 'simple', // 'simple' or 'custom'
        status: 'pending',
        payment_status: 'pending',
      }

      // Link to Service document when admin selected an existing service
      if (selectedServiceId && project_type === 'simple') {
        projectData.selected_service = selectedServiceId
      }

      // Handle service selection for simple projects (catalog)
      if (project_type === 'simple' && service && service !== 'Custom Service') {
        projectData.service_name = service
        projectData.delivery_timeline = delivery_timeline || '30 days'
        if (typeof service_description === 'string') projectData.service_description = service_description
        if (typeof max_revisions === 'number' && max_revisions >= 0 && max_revisions <= 99) projectData.max_revisions = max_revisions

        if (service_price) {
          const price = parseFloat(service_price.toString().replace('$', '').replace(',', '').trim())
          if (!isNaN(price)) projectData.service_price = price
        }
        if (service_price_eur !== undefined && service_price_eur !== null && service_price_eur !== '') {
          const priceEur = parseFloat(String(service_price_eur).replace('$', '').replace(',', '').replace('€', '').trim())
          if (!isNaN(priceEur) && priceEur >= 0) projectData.service_price_eur = priceEur
        }
      } else if (project_type === 'custom' || (service === 'Custom Service' && amount)) {
        projectData.project_type = 'custom'
        projectData.delivery_timeline = '30 days'
        if (amount) {
          projectData.custom_quote_amount = parseFloat(amount.toString().replace('$', '').replace(',', ''))
        }
      }

      if (deadline && project_type !== 'simple') {
        projectData.deadline = new Date(deadline)
      }

      const project = await Project.create(projectData)

      return ApiResponse.success(res, project, 'Project created successfully', 201)
    } catch (error: any) {
      return ApiResponse.error(res, error.message, 500)
    }
  }

  // Get all projects (admin)
  static async getAllProjects(req: Request, res: Response) {
    try {
      const projects = await Project.find()
        .populate('selected_service')
        .populate('assigned_collaborator', 'first_name last_name')
        .sort({ created_at: -1 })

      return ApiResponse.success(res, projects, 'Projects retrieved successfully')
    } catch (error: any) {
      return ApiResponse.error(res, error.message, 500)
    }
  }

  // Get all projects for a specific client (by email)
  static async getClientProjects(req: Request, res: Response) {
    try {
      const { email } = req.params

      if (!email) {
        return ApiResponse.error(res, 'Client email is required', 400)
      }

      const projects = await Project.find({ client_email: email })
        .populate('selected_service')
        .sort({ created_at: -1 })

      return ApiResponse.success(res, projects, 'Client projects retrieved successfully')
    } catch (error: any) {
      return ApiResponse.error(res, error.message, 500)
    }
  }

  // Get all simple projects (public, no auth required)
  static async getSimpleProjects(req: Request, res: Response) {
    try {
      const projects = await Project.find({ project_type: 'simple' })
        .populate('selected_service')
        .sort({ created_at: -1 })

      return ApiResponse.success(res, projects, 'Simple projects retrieved successfully')
    } catch (error: any) {
      return ApiResponse.error(res, error.message, 500)
    }
  }

  // Create a new project for the current user when they choose a service (like Fiverr: each purchase is a new order; multiple users can buy the same service)
  static async startFromCatalog(req: Request, res: Response) {
    try {
      const authReq = req as AuthRequest
      if (authReq.user?.role !== 'client') {
        return ApiResponse.error(res, 'Only clients can start a project from the catalog', 403)
      }
      const { projectId } = req.body
      if (!projectId) {
        return ApiResponse.error(res, 'projectId is required', 400)
      }
      const template = await Project.findById(projectId)
      if (!template || template.project_type !== 'simple') {
        return ApiResponse.error(res, 'Project not found or not a catalog project', 404)
      }
      const userEmail = (authReq.user.email || '').trim()
      const newProject = await Project.create({
        name: template.name,
        client_name: 'Client',
        client_email: userEmail,
        project_type: 'simple',
        service_name: template.service_name,
        service_price: template.service_price,
        delivery_timeline: template.delivery_timeline || '30 days',
        status: 'pending',
        payment_status: 'pending',
      })
      const populated = await Project.findById(newProject._id).populate('selected_service')
      return ApiResponse.success(res, populated || newProject, 'Project created for you', 201)
    } catch (error: any) {
      return ApiResponse.error(res, error.message, 500)
    }
  }

  // Get all projects for authenticated client (uses JWT token)
  static async getMyProjects(req: Request, res: Response) {
    try {
      const userEmail = (req as any).user?.email

      if (!userEmail) {
        return ApiResponse.error(res, 'User not authenticated', 401)
      }

      const projects = await Project.find({ client_email: userEmail })
        .populate('selected_service')
        .sort({ created_at: -1 })

      const sanitized = projects.map((p) => sanitizeProjectForClient(p))
      return ApiResponse.success(res, sanitized, 'Your projects retrieved successfully')
    } catch (error: any) {
      return ApiResponse.error(res, error.message, 500)
    }
  }

  // Update project status
  static async updateStatus(req: Request, res: Response) {
    try {
      const { projectId } = req.params
      const { status, notes, notes_key } = req.body
      const authReq = req as AuthRequest

      if (!status) {
        return ApiResponse.error(res, 'Status is required', 400)
      }

      // Only the client can request revision (via claim-revision). Collaborators must not set status to 'revision'.
      if (status === 'revision' && authReq.user?.role === 'collaborator') {
        return ApiResponse.error(
          res,
          'Only the client can request a revision. Use your dashboard to update progress (e.g. In Progress, Review).',
          403
        )
      }

      // Only client (after acceptance) or admin can mark completed. Collaborators must not set status to 'completed'.
      if (status === 'completed' && authReq.user?.role === 'collaborator') {
        return ApiResponse.error(
          res,
          'Only the client or admin can mark the project as completed. Please use In Progress or Review to update delivery status.',
          403
        )
      }

      // Check if project exists
      const project = await Project.findById(projectId)
      if (!project) {
        return ApiResponse.notFound(res, 'Project not found')
      }

      // Invoice approval is no longer required for status changes
      // Collaborators can change project status regardless of invoice status

      const update: any = { status, updated_at: new Date() }
      
      // Track when project is completed
      if (status === 'completed' && project.status !== 'completed') {
        update.completed_at = new Date()
      }
      
      if (typeof notes === 'string' && notes.trim().length > 0) {
        // Store note under a specific key in status_notes (default: the status name)
        const key =
          typeof notes_key === 'string' && notes_key.trim().length > 0
            ? notes_key.trim()
            : status
        let noteToStore = notes.trim()

        // Professional masked delivery link: when status is "review" and notes contain "Delivery link: <url>"
        const deliveryPrefix = 'Delivery link:'
        if (status === 'review' && noteToStore.toLowerCase().startsWith(deliveryPrefix.toLowerCase())) {
          const afterPrefix = noteToStore.slice(deliveryPrefix.length).trim()
          const urlMatch = afterPrefix.split(/\s/)[0]
          const validUrl = normalizeAndValidateDeliveryUrl(urlMatch)
          if (validUrl) {
            let token = project.deliveryToken
            if (!token) {
              token = generateDeliveryToken()
            }
            update.deliveryUrl = validUrl
            update.deliveryToken = token
            update.isDelivered = true
            const baseUrl = resolveDeliveryBaseUrl(req)
            noteToStore = baseUrl ? `${deliveryPrefix} ${baseUrl.replace(/\/$/, '')}/delivery/${token}` : `${deliveryPrefix} [Link]`
          } else if (urlMatch) {
            return ApiResponse.error(
              res,
              'Invalid delivery link. Please use a valid http:// or https:// URL.',
              400
            )
          }
        }
        update[`status_notes.${key}`] = noteToStore
      }

      const updatedProject = await Project.findByIdAndUpdate(projectId, update, { new: true })

      if (!updatedProject) {
        return ApiResponse.notFound(res, 'Project not found')
      }

      return ApiResponse.success(res, updatedProject, 'Status updated successfully')
    } catch (error: any) {
      return ApiResponse.error(res, error.message, 500)
    }
  }

  // Approve invoice (admin only)
  static async approveInvoice(req: Request, res: Response) {
    try {
      const { projectId } = req.params

      const project = await Project.findById(projectId)

      if (!project) {
        return ApiResponse.notFound(res, 'Project not found')
      }

      if (!project.invoice_url) {
        return ApiResponse.error(res, 'No invoice uploaded for this project', 400)
      }

      if (project.invoice_status === 'approved') {
        return ApiResponse.error(res, 'Invoice is already approved', 400)
      }

      // If this is a monthly invoice, approve all projects in the same monthly invoice group
      if (project.invoice_type === 'monthly' && project.monthly_invoice_id) {
        const monthlyInvoiceId = project.monthly_invoice_id
        const updateResult = await Project.updateMany(
          { monthly_invoice_id: monthlyInvoiceId },
          {
            invoice_status: 'approved',
            invoice_approved_at: new Date(),
            updated_at: new Date(),
          }
        )

        const updatedProjects = await Project.find({ monthly_invoice_id: monthlyInvoiceId })
          .populate('assigned_collaborator', 'first_name last_name')

        return ApiResponse.success(
          res,
          { projects: updatedProjects, count: updateResult.modifiedCount },
          `Monthly invoice approved successfully for ${updateResult.modifiedCount} project(s)`
        )
      }

      // Regular per-project invoice approval
      const updatedProject = await Project.findByIdAndUpdate(
        projectId,
        {
          invoice_status: 'approved',
          invoice_approved_at: new Date(),
          updated_at: new Date(),
        },
        { new: true }
      ).populate('assigned_collaborator', 'first_name last_name')

      return ApiResponse.success(res, updatedProject, 'Invoice approved successfully')
    } catch (error: any) {
      return ApiResponse.error(res, error.message, 500)
    }
  }

  // Reject invoice (admin only) - optional
  static async rejectInvoice(req: Request, res: Response) {
    try {
      const { projectId } = req.params

      const project = await Project.findById(projectId)

      if (!project) {
        return ApiResponse.notFound(res, 'Project not found')
      }

      if (!project.invoice_url) {
        return ApiResponse.error(res, 'No invoice uploaded for this project', 400)
      }

      // If this is a monthly invoice, reject all projects in the same monthly invoice group
      if (project.invoice_type === 'monthly' && project.monthly_invoice_id) {
        const monthlyInvoiceId = project.monthly_invoice_id
        const updateResult = await Project.updateMany(
          { monthly_invoice_id: monthlyInvoiceId },
          {
            invoice_status: 'rejected',
            updated_at: new Date(),
          }
        )

        const updatedProjects = await Project.find({ monthly_invoice_id: monthlyInvoiceId })
          .populate('assigned_collaborator', 'first_name last_name')

        return ApiResponse.success(
          res,
          { projects: updatedProjects, count: updateResult.modifiedCount },
          `Monthly invoice rejected for ${updateResult.modifiedCount} project(s)`
        )
      }

      // Regular per-project invoice rejection
      const updatedProject = await Project.findByIdAndUpdate(
        projectId,
        {
          invoice_status: 'rejected',
          updated_at: new Date(),
        },
        { new: true }
      ).populate('assigned_collaborator', 'first_name last_name')

      return ApiResponse.success(res, updatedProject, 'Invoice rejected')
    } catch (error: any) {
      return ApiResponse.error(res, error.message, 500)
    }
  }

  // Assign collaborator
  static async assignCollaborator(req: Request, res: Response) {
    try {
      const { projectId } = req.params
      const { collaborator_id, payment_amount } = req.body

      if (!collaborator_id) {
        return ApiResponse.error(res, 'Collaborator ID is required', 400)
      }

      if (!payment_amount || payment_amount <= 0) {
        return ApiResponse.error(res, 'Payment amount is required and must be greater than 0', 400)
      }

      // Verify collaborator exists
      const { Collaborator } = await import('../models/Collaborator')
      const collaborator = await Collaborator.findById(collaborator_id)
      
      if (!collaborator) {
        return ApiResponse.notFound(res, 'Collaborator not found')
      }

      // Update project with collaborator assignment and payment
      const project = await Project.findByIdAndUpdate(
        projectId,
        { 
          assigned_collaborator: collaborator_id,
          collaborator_payment_amount: parseFloat(payment_amount.toString().replace('$', '').replace(',', '')),
          updated_at: new Date() 
        },
        { new: true }
      ).populate('assigned_collaborator', 'first_name last_name')

      if (!project) {
        return ApiResponse.notFound(res, 'Project not found')
      }

      // Fire-and-forget email to collaborator about new assignment
      const collabName = `${collaborator.first_name || ''} ${collaborator.last_name || ''}`.trim()
      sendCollaboratorProjectAssignedEmail(
        collaborator.email,
        collabName,
        project._id.toString(),
        project.name || 'New Project'
      ).catch((emailError: any) => {
        console.error('Failed to send collaborator project assignment email:', emailError?.message || emailError)
      })

      return ApiResponse.success(res, project, 'Collaborator assigned successfully')
    } catch (error: any) {
      return ApiResponse.error(res, error.message, 500)
    }
  }

  // Unassign collaborator
  static async unassignCollaborator(req: Request, res: Response) {
    try {
      const { projectId } = req.params

      const project = await Project.findByIdAndUpdate(
        projectId,
        { 
          assigned_collaborator: null,
          collaborator_payment_amount: undefined,
          updated_at: new Date() 
        },
        { new: true }
      )

      if (!project) {
        return ApiResponse.notFound(res, 'Project not found')
      }

      return ApiResponse.success(res, project, 'Collaborator unassigned successfully')
    } catch (error: any) {
      return ApiResponse.error(res, error.message, 500)
    }
  }

  // Update project settings (admin only), e.g. max_revisions
  static async updateProjectSettings(req: Request, res: Response) {
    try {
      const authReq = req as AuthRequest
      if (authReq.user?.role !== 'admin') {
        return ApiResponse.error(res, 'Only admin can update project settings', 403)
      }

      const { projectId } = req.params
      const { max_revisions } = req.body

      const project = await Project.findById(projectId)
      if (!project) {
        return ApiResponse.notFound(res, 'Project not found')
      }

      const update: any = { updated_at: new Date() }
      if (typeof max_revisions === 'number' && max_revisions >= 0 && max_revisions <= 99) {
        update.max_revisions = max_revisions
      }

      const updatedProject = await Project.findByIdAndUpdate(projectId, update, { new: true })
      if (!updatedProject) {
        return ApiResponse.notFound(res, 'Project not found')
      }

      return ApiResponse.success(res, updatedProject, 'Project settings updated')
    } catch (error: any) {
      return ApiResponse.error(res, error.message, 500)
    }
  }

  // Update catalog item (admin only) – for predefined/simple projects: name, price, description, delivery, revisions
  static async updateCatalogItem(req: Request, res: Response) {
    try {
      const authReq = req as AuthRequest
      if (authReq.user?.role !== 'admin') {
        return ApiResponse.error(res, 'Only admin can edit catalog items', 403)
      }

      const { projectId } = req.params
      const { name, service_name, service_price, service_price_eur, service_description, delivery_timeline, max_revisions } = req.body

      const project = await Project.findById(projectId)
      if (!project) {
        return ApiResponse.notFound(res, 'Project not found')
      }
      if (project.project_type !== 'simple') {
        return ApiResponse.error(res, 'Only predefined (catalog) projects can be edited here', 400)
      }

      const set: any = { updated_at: new Date() }
      if (typeof name === 'string' && name.trim()) set.name = name.trim()
      if (typeof service_name === 'string') set.service_name = service_name.trim() || undefined
      if (typeof service_description === 'string') set.service_description = service_description.trim() || undefined
      if (typeof delivery_timeline === 'string' && delivery_timeline.trim()) set.delivery_timeline = delivery_timeline.trim()
      if (service_price !== undefined && service_price !== null && service_price !== '') {
        const price = typeof service_price === 'number'
          ? service_price
          : parseFloat(String(service_price).replace(/\$/g, '').replace(/,/g, '').trim())
        if (!isNaN(price) && price >= 0) set.service_price = price
      }
      if (service_price_eur !== undefined && service_price_eur !== null && service_price_eur !== '') {
        const priceEur = typeof service_price_eur === 'number'
          ? service_price_eur
          : parseFloat(String(service_price_eur).replace(/[€$]/g, '').replace(/,/g, '').trim())
        if (!isNaN(priceEur) && priceEur >= 0) set.service_price_eur = priceEur
      } else if (service_price_eur === null || service_price_eur === '') {
        set.service_price_eur = undefined
      }
      if (typeof max_revisions === 'number' && max_revisions >= 0 && max_revisions <= 99) set.max_revisions = max_revisions

      const updatedProject = await Project.findByIdAndUpdate(projectId, { $set: set }, { new: true })
      if (!updatedProject) {
        return ApiResponse.notFound(res, 'Project not found')
      }

      return ApiResponse.success(res, updatedProject, 'Catalog item updated')
    } catch (error: any) {
      return ApiResponse.error(res, error.message, 500)
    }
  }

  // Delete a catalog item (admin only) – permanently remove a predefined/simple project template
  static async deleteCatalogItem(req: Request, res: Response) {
    try {
      const authReq = req as AuthRequest
      if (authReq.user?.role !== 'admin') {
        return ApiResponse.error(res, 'Only admin can delete catalog items', 403)
      }

      const { projectId } = req.params

      const project = await Project.findById(projectId)
      if (!project) {
        return ApiResponse.notFound(res, 'Project not found')
      }
      if (project.project_type !== 'simple') {
        return ApiResponse.error(res, 'Only predefined (catalog) projects can be deleted here', 400)
      }

      await Project.findByIdAndDelete(projectId)

      return ApiResponse.success(res, null, 'Catalog item deleted')
    } catch (error: any) {
      return ApiResponse.error(res, error.message, 500)
    }
  }

  // Claim revision (client can claim a revision)
  static async claimRevision(req: Request, res: Response) {
    try {
      const { projectId } = req.params
      const { description } = req.body

      const project = await Project.findById(projectId)

      if (!project) {
        return ApiResponse.notFound(res, 'Project not found')
      }

      // Check if project is paid
      if (project.payment_status !== 'paid') {
        return ApiResponse.error(res, 'Project must be paid before claiming revisions', 400)
      }

      // Get current revision counts
      const revisionsUsed = project.revisions_used || 0
      const maxRevisions = project.max_revisions || 3

      // Check if revisions are available
      if (revisionsUsed >= maxRevisions) {
        return ApiResponse.error(res, `All ${maxRevisions} revisions have been used`, 400)
      }

      // Prepare update data
      const updateData: any = {
        revisions_used: revisionsUsed + 1,
        status: 'revision',
        updated_at: new Date()
      }

      // Store revision description in status_notes.revision
      if (typeof description === 'string' && description.trim().length > 0) {
        updateData['status_notes.revision'] = description.trim()
      }

      // Update project: increment revisions_used and set status to 'revision'
      const updatedProject = await Project.findByIdAndUpdate(
        projectId,
        updateData,
        { new: true }
      )

      return ApiResponse.success(
        res,
        updatedProject,
        `Revision claimed successfully. ${maxRevisions - (revisionsUsed + 1)} revision(s) remaining.`
      )
    } catch (error: any) {
      return ApiResponse.error(res, error.message, 500)
    }
  }

  // Get all monthly invoices grouped by month (admin)
  static async getMonthlyInvoices(req: Request, res: Response) {
    try {
      // Find all projects with monthly invoices
      const monthlyInvoiceProjects = await Project.find({
        invoice_type: 'monthly',
        monthly_invoice_id: { $exists: true, $ne: null },
        invoice_url: { $exists: true, $ne: null },
      })
        .populate('assigned_collaborator', 'first_name last_name')
        .sort({ monthly_invoice_month: -1, invoice_uploaded_at: -1 })

      // Group by monthly_invoice_id
      const groupedInvoices: Record<string, any> = {}

      monthlyInvoiceProjects.forEach((project) => {
        const invoiceId = project.monthly_invoice_id!
        if (!groupedInvoices[invoiceId]) {
          groupedInvoices[invoiceId] = {
            monthly_invoice_id: invoiceId,
            month: project.monthly_invoice_month,
            invoice_url: project.invoice_url,
            invoice_public_id: project.invoice_public_id,
            invoice_status: project.invoice_status,
            invoice_uploaded_at: project.invoice_uploaded_at,
            invoice_approved_at: project.invoice_approved_at,
            projects: [],
            total_amount: 0,
            collaborator: project.assigned_collaborator,
          }
        }

        groupedInvoices[invoiceId].projects.push({
          _id: project._id,
          name: project.name,
          client_name: project.client_name,
          collaborator_payment_amount: project.collaborator_payment_amount,
          status: project.status,
        })

        groupedInvoices[invoiceId].total_amount += project.collaborator_payment_amount || 0
      })

      // Convert to array and sort by month
      const invoices = Object.values(groupedInvoices).sort((a: any, b: any) => {
        if (a.month < b.month) return 1
        if (a.month > b.month) return -1
        return 0
      })

      return ApiResponse.success(res, invoices, 'Monthly invoices retrieved successfully')
    } catch (error: any) {
      return ApiResponse.error(res, error.message, 500)
    }
  }

}
