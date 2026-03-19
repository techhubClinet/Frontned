import nodemailer from 'nodemailer'

// Email configuration from environment (Kanri panel addresses)
const SMTP_USER = process.env.SMTP_USER || process.env.GMAIL_USER
const SMTP_PASSWORD = process.env.SMTP_PASSWORD || process.env.GMAIL_APP_PASSWORD
const EMAIL_FROM_CLIENT = process.env.EMAIL_FROM_CLIENT || SMTP_USER || 'clients@kanridesign.com'
const EMAIL_FROM_COLLABORATOR = process.env.EMAIL_FROM_COLLABORATOR || SMTP_USER || 'collaborators@kanridesign.com'
const EMAIL_FROM_ADMIN = process.env.EMAIL_FROM_ADMIN || SMTP_USER || 'admin@kanridesign.com'

const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://www.kanridesign.com').replace(/\/$/, '')

const createTransporter = () => {
  if (!SMTP_USER || !SMTP_PASSWORD) {
    console.warn('⚠️  SMTP credentials not configured (SMTP_USER / SMTP_PASSWORD or GMAIL_*). Emails will be logged to console only.')
    return {
      sendMail: async (options: any) => {
        console.log('\n📧 EMAIL WOULD BE SENT:')
        console.log('From:', options.from)
        console.log('To:', options.to)
        console.log('Subject:', options.subject)
        console.log('---\n')
        return { messageId: 'dev-' + Date.now() }
      }
    }
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASSWORD,
    },
  })
}

export const sendClientDashboardEmail = async (
  clientEmail: string,
  clientName: string,
  projectId: string,
  projectName: string
) => {
  const dashboardUrl = `${FRONTEND_URL}/client/${projectId}/dashboard`

  // When SMTP is not configured (e.g. localhost), log and return success: false so UI shows "Email not sent"
  if (!SMTP_USER || !SMTP_PASSWORD) {
    console.log('\n' + '='.repeat(80))
    console.log('📧 CLIENT DASHBOARD LINK (SMTP not configured – no email sent to:', clientEmail, ')')
    console.log('='.repeat(80))
    console.log('📋 Project:', projectName)
    console.log('👤 Client:', clientName)
    console.log('🔗 Dashboard URL:', dashboardUrl)
    console.log('🔗 Direct Project Link:', `${FRONTEND_URL}/client/${projectId}`)
    console.log('💡 Set SMTP_USER and SMTP_PASSWORD in backend/.env to send real emails on localhost.')
    console.log('='.repeat(80) + '\n')
    return { success: false, error: 'SMTP not configured' }
  }

  const transporter = createTransporter()

  // Log the dashboard link to console for easy access during development
  console.log('\n' + '='.repeat(80))
  console.log('📧 CLIENT DASHBOARD LINK (Email would be sent to:', clientEmail, ')')
  console.log('='.repeat(80))
  console.log('📋 Project:', projectName)
  console.log('👤 Client:', clientName)
  console.log('🔗 Dashboard URL:', dashboardUrl)
  console.log('🔗 Direct Project Link:', `${FRONTEND_URL}/client/${projectId}`)
  console.log('='.repeat(80) + '\n')

  const mailOptions = {
    from: `"Kanri Design" <${EMAIL_FROM_CLIENT}>`,
    to: clientEmail,
    subject: `Your Project Dashboard: ${projectName}`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 0; background: #f3f4f6; }
            .container { max-width: 560px; margin: 0 auto; padding: 24px; }
            .card { background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
            .header { background: #ea580c; padding: 26px 20px 20px; text-align: center; }
            .logo-wrap { display: flex; align-items: center; justify-content: center; margin-bottom: 10px; }
            .logo-wrap img { display: block; width: 96px; height: 96px; border-radius: 16px; object-fit: contain; background: #ea580c; border: 2px solid rgba(255,255,255,0.7); }
            .header h1 { margin: 6px 0 0; font-size: 1.5rem; font-weight: 700; color: #ffffff; }
            .content { padding: 28px 24px; background: #ffffff; color: #374151; }
            .content p { margin: 0 0 1rem; font-size: 15px; }
            .btn-wrap { text-align: center; margin: 24px 0; }
            .link-box { background: #f3f4f6; padding: 12px 14px; border-radius: 8px; word-break: break-all; font-size: 13px; color: #4b5563; margin: 16px 0; border: 1px solid #e5e7eb; }
            .footer { text-align: center; padding: 20px; color: #9ca3af; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="card">
              <div class="header">
                <div class="logo-wrap">
                  <img src="${FRONTEND_URL}/logo.jpeg" alt="KANRI logo" />
                </div>
                <h1>Your Project is Ready!</h1>
              </div>
              <div class="content">
                <p>Hi ${clientName},</p>
                <p>Great news! Your project <strong>${projectName}</strong> is now active.</p>
                <p>You can track your project progress, view updates, and see the status at any time using the link below:</p>
                <div class="btn-wrap">
                  <a href="${dashboardUrl}" style="display: inline-block; padding: 14px 28px; background-color: #ea580c; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">View Project Dashboard</a>
                </div>
                <p>Or copy this link:</p>
                <div class="link-box">${dashboardUrl}</div>
                <p>This link is private and secure. Only you can access your project dashboard.</p>
              </div>
            </div>
            <div class="footer">
              <p>This is an automated message. Please do not reply.</p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `
      Hi ${clientName},

      Great news! Your project "${projectName}" is now active.

      You can track your project progress using this link:
      ${dashboardUrl}

      This link is private and secure. Only you can access your project dashboard.

      Best regards,
      Client Project Portal
    `,
  }

  try {
    const result = await transporter.sendMail(mailOptions)
    console.log('✅ Email sent successfully!')
    console.log('   Message ID:', result.messageId)
    console.log('   To:', clientEmail)
    console.log('   Subject:', mailOptions.subject)
    return { success: true, messageId: result.messageId }
  } catch (error: any) {
    console.error('❌ Email send error:', error.message)
    if (error.code === 'EAUTH') {
      console.error('   Gmail: Use an App Password (not your normal password). See https://support.google.com/accounts/answer/185833')
    } else if (error.code === 'ECONNECTION') {
      console.error('   Connection failed. Check internet or firewall.')
    }
    return { success: false, error: error.message }
  }
}

/** Send welcome email to a new collaborator with login email and password. */
export const sendCollaboratorWelcomeEmail = async (
  collaboratorEmail: string,
  collaboratorName: string,
  password: string
) => {
  const transporter = createTransporter()
  const loginUrl = `${FRONTEND_URL}/login?redirect=/collaborator/projects`
  console.log('\n' + '='.repeat(80))
  console.log('📧 COLLABORATOR WELCOME EMAIL (Email would be sent to:', collaboratorEmail, ')')
  console.log('='.repeat(80))
  console.log('👤 Collaborator:', collaboratorName)
  console.log('🔐 Email:', collaboratorEmail)
  console.log('🔗 Login URL:', loginUrl)
  console.log('='.repeat(80) + '\n')
  const safeName = collaboratorName || 'there'

  const mailOptions = {
    from: `"Kanri Design" <${EMAIL_FROM_COLLABORATOR}>`,
    to: collaboratorEmail,
    subject: 'You have been added as a collaborator',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 0; background: #f3f4f6; }
            .container { max-width: 560px; margin: 0 auto; padding: 24px; }
            .card { background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
            .header { background: #ea580c; padding: 26px 20px 20px; text-align: center; }
            .logo-wrap { display: flex; align-items: center; justify-content: center; margin-bottom: 10px; }
            .logo-wrap img { display: block; width: 96px; height: 96px; border-radius: 16px; object-fit: contain; background: #ea580c; border: 2px solid rgba(255,255,255,0.7); }
            .header h1 { margin: 6px 0 0; font-size: 1.5rem; font-weight: 700; color: #ffffff; }
            .content { padding: 28px 24px; }
            .content p { margin: 0 0 1rem; font-size: 15px; }
            .credentials { background: #f9fafb; border-radius: 8px; padding: 12px 14px; border: 1px solid #e5e7eb; font-size: 13px; }
            .credentials code { background: #111827; color: #f9fafb; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
            .btn-wrap { text-align: center; margin: 24px 0 8px; }
            .footer { text-align: center; padding: 20px; color: #9ca3af; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="card">
              <div class="header">
                <div class="logo-wrap">
                  <img src="${FRONTEND_URL}/logo.jpeg" alt="KANRI logo" />
                </div>
                <h1>Collaborator Access</h1>
              </div>
              <div class="content">
                <p>Hi ${safeName},</p>
                <p>You've been added as a <strong>collaborator</strong> to the project portal. You can now log in to see the projects assigned to you and update their progress.</p>
                <p>Use the credentials below to sign in:</p>
                <div class="credentials">
                  <p><strong>Login Email:</strong> <code>${collaboratorEmail}</code></p>
                  <p><strong>Password:</strong> <code>${password}</code></p>
                </div>
                <div class="btn-wrap">
                  <a href="${loginUrl}" style="display: inline-block; padding: 12px 24px; background-color: #1d4ed8; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">Sign in as Collaborator</a>
                </div>
                <p style="font-size: 13px; color: #6b7280;">For security, we recommend that you log in and change your password as soon as possible.</p>
              </div>
            </div>
            <div class="footer">
              <p>This is an automated message. Please do not reply.</p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `
      Hi ${safeName},

      You've been added as a collaborator to the project portal.

      Login Email: ${collaboratorEmail}
      Password: ${password}

      Sign in here:
      ${loginUrl}

      For security, please log in and change your password as soon as possible.

      This is an automated message. Please do not reply.
    `,
  }

  try {
    const result = await transporter.sendMail(mailOptions)
    console.log('✅ Collaborator welcome email sent!', {
      to: collaboratorEmail,
      messageId: result.messageId,
    })
    return { success: true, messageId: result.messageId }
  } catch (error: any) {
    console.error('❌ Collaborator welcome email failed:', error.message)
    return { success: false, error: error.message }
  }
}

/** Notify a collaborator that a new project has been assigned to them. */
export const sendCollaboratorProjectAssignedEmail = async (
  collaboratorEmail: string,
  collaboratorName: string,
  projectId: string,
  projectName: string
) => {
  const transporter = createTransporter()
  const projectUrl = `${FRONTEND_URL}/collaborator/projects/${projectId}`
  const dashboardUrl = `${FRONTEND_URL}/collaborator/projects`
  const safeName = collaboratorName || 'there'

  console.log('\n' + '='.repeat(80))
  console.log('📧 COLLABORATOR PROJECT ASSIGNED EMAIL (Email would be sent to:', collaboratorEmail, ')')
  console.log('='.repeat(80))
  console.log('👤 Collaborator:', safeName)
  console.log('📋 Project:', projectName)
  console.log('🔗 Project URL:', projectUrl)
  console.log('🔗 Collaborator Dashboard:', dashboardUrl)
  console.log('='.repeat(80) + '\n')

  const mailOptions = {
    from: `"Kanri Design" <${EMAIL_FROM_COLLABORATOR}>`,
    to: collaboratorEmail,
    subject: `New project assigned: ${projectName}`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 0; background: #f3f4f6; }
            .container { max-width: 560px; margin: 0 auto; padding: 24px; }
            .card { background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
            .header { background: #ea580c; padding: 26px 20px 20px; text-align: center; }
            .logo-wrap { display: flex; align-items: center; justify-content: center; margin-bottom: 10px; }
            .logo-wrap img { display: block; width: 96px; height: 96px; border-radius: 16px; object-fit: contain; background: #ea580c; border: 2px solid rgba(255,255,255,0.7); }
            .header h1 { margin: 6px 0 0; font-size: 1.5rem; font-weight: 700; color: #ffffff; }
            .content { padding: 28px 24px; }
            .content p { margin: 0 0 1rem; font-size: 15px; }
            .btn-wrap { text-align: center; margin: 24px 0 8px; }
            .secondary-link { font-size: 13px; color: #6b7280; text-align: center; }
            .footer { text-align: center; padding: 20px; color: #9ca3af; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="card">
              <div class="header">
                <div class="logo-wrap">
                  <img src="${FRONTEND_URL}/logo.jpeg" alt="KANRI logo" />
                </div>
                <h1>New Project Assigned</h1>
              </div>
              <div class="content">
                <p>Hi ${safeName},</p>
                <p>You have been assigned to a new project:</p>
                <p><strong>${projectName}</strong></p>
                <div class="btn-wrap">
                  <a
                    href="${projectUrl}"
                    style="
                      display: inline-block;
                      padding: 12px 24px;
                      background-color: #ea580c;
                      color: #ffffff;
                      text-decoration: none;
                      border-radius: 8px;
                      font-weight: 600;
                      font-size: 15px;
                    "
                  >
                    Open Project
                  </a>
                </div>
                <p class="secondary-link">
                  Or view all your projects here:<br />
                  <a href="${dashboardUrl}" style="color: #1d4ed8; text-decoration: none;">${dashboardUrl}</a>
                </p>
              </div>
            </div>
            <div class="footer">
              <p>This is an automated message. Please do not reply.</p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `
      Hi ${safeName},

      You have been assigned to a new project:
      "${projectName}"

      Open the project:
      ${projectUrl}

      Or view all your projects:
      ${dashboardUrl}

      This is an automated message. Please do not reply.
    `,
  }

  try {
    const result = await transporter.sendMail(mailOptions)
    console.log('✅ Collaborator project assignment email sent!', {
      to: collaboratorEmail,
      messageId: result.messageId,
    })
    return { success: true, messageId: result.messageId }
  } catch (error: any) {
    console.error('❌ Collaborator project assignment email failed:', error.message)
    return { success: false, error: error.message }
  }
}

/** Notify admin(s) that a collaborator uploaded an invoice (per-project or monthly). */
export const sendAdminInvoiceUploadedEmail = async (
  adminEmails: string[],
  options: {
    projectName?: string
    projectId?: string
    collaboratorName?: string
    kind: 'per-project' | 'monthly'
    month?: string
    projectsCount?: number
  }
) => {
  if (!adminEmails.length) return { success: false, error: 'No admin emails' }

  const adminProjectsUrl = `${FRONTEND_URL}/admin/projects`
  const projectDetailUrl = options.projectId ? `${FRONTEND_URL}/admin/projects/${options.projectId}` : adminProjectsUrl

  const isMonthly = options.kind === 'monthly'
  const subject = isMonthly
    ? `Monthly invoice uploaded for ${options.month || 'N/A'} (${options.projectsCount || 0} project(s))`
    : `Invoice uploaded: ${options.projectName || 'Project'}`
  const bodyHtml = isMonthly
    ? `
      <p>A collaborator${options.collaboratorName ? ` (${options.collaboratorName})` : ''} has uploaded a <strong>monthly invoice</strong> for <strong>${options.month || 'N/A'}</strong> covering <strong>${options.projectsCount ?? 0} project(s)</strong>.</p>
      <p>Please review and approve or reject from the admin dashboard.</p>
      <div class="btn-wrap"><a href="${adminProjectsUrl}" style="display: inline-block; padding: 14px 28px; background-color: #1d4ed8; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600;">View Admin Dashboard</a></div>
    `
    : `
      <p>A collaborator${options.collaboratorName ? ` (${options.collaboratorName})` : ''} has uploaded an <strong>invoice</strong> for project: <strong>${options.projectName || 'Project'}</strong>.</p>
      <p>Please review and approve or reject from the project page.</p>
      <div class="btn-wrap"><a href="${projectDetailUrl}" style="display: inline-block; padding: 14px 28px; background-color: #1d4ed8; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600;">View Project</a></div>
    `

  const transporter = createTransporter()
  const mailOptions = {
    from: `"Kanri Design" <${EMAIL_FROM_ADMIN}>`,
    to: adminEmails.join(', '),
    subject: `[Admin] ${subject}`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 0; background: #f3f4f6; }
            .container { max-width: 560px; margin: 0 auto; padding: 24px; }
            .card { background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
            .header { background: #ea580c; padding: 22px 20px 18px; text-align: center; }
            .logo-wrap { display: flex; align-items: center; justify-content: center; margin-bottom: 8px; }
            .logo-wrap img { display: block; width: 72px; height: 72px; border-radius: 12px; object-fit: cover; border: 2px solid rgba(255,255,255,0.7); }
            .header h1 { margin: 6px 0 0; font-size: 1.25rem; font-weight: 700; color: #ffffff; }
            .content { padding: 28px 24px; }
            .content p { margin: 0 0 1rem; font-size: 15px; }
            .btn-wrap { text-align: center; margin: 24px 0; }
            .footer { text-align: center; padding: 20px; color: #9ca3af; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="card">
              <div class="header">
                <div class="logo-wrap">
                  <img src="${FRONTEND_URL}/logo.jpeg" alt="KANRI logo" />
                </div>
                <h1>Invoice uploaded</h1>
              </div>
              <div class="content">${bodyHtml}</div>
            </div>
            <div class="footer"><p>This is an automated admin notification.</p></div>
          </div>
        </body>
      </html>
    `,
    text: isMonthly
      ? `A collaborator has uploaded a monthly invoice for ${options.month} (${options.projectsCount} project(s)). View: ${adminProjectsUrl}`
      : `An invoice was uploaded for project "${options.projectName}". View: ${projectDetailUrl}`,
  }

  try {
    const result = await transporter.sendMail(mailOptions)
    console.log('✅ Admin invoice notification sent to', adminEmails.join(', '))
    return { success: true, messageId: result.messageId }
  } catch (error: any) {
    console.error('❌ Admin invoice notification failed:', error.message)
    return { success: false, error: error.message }
  }
}

// TEMP: helper for manually testing email styling locally.
// Run: `npm run build` then `node dist/services/emailService.js`
// This block runs ONLY when this file is executed directly with Node
async function __sendTestKanriEmail() {
  try {
    await sendClientDashboardEmail(
      'aryanarshad5413@gmail.com',
      'Test Client',
      'TEST_PROJECT_ID',
      'Test Project for Styling'
    )
    console.log('✅ Test email sent to aryanarshad5413@gmail.com')
  } catch (err: any) {
    console.error('❌ Failed to send test email:', err?.message || err)
  }
}

// Only trigger the test when this module is the entrypoint (node dist/services/emailService.js)
// Comment out this block after you’re done testing to avoid accidental sends.
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const isMain = typeof require !== 'undefined' && require.main === module
  if (isMain) {
    __sendTestKanriEmail().catch(console.error)
  }
} catch {
  // ignore if require/module not available (e.g. in some bundlers)
}
