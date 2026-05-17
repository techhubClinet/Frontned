/** Emails that always receive admin role on login (plus ADMIN_EMAILS env). */
const DEFAULT_ADMIN_EMAILS = ['izan@madebyizan.com', 'admin1234@gmail.com']

export function getAdminEmails(): string[] {
  const fromEnv =
    process.env.ADMIN_EMAILS?.split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean) ?? []
  return [...new Set([...fromEnv, ...DEFAULT_ADMIN_EMAILS])]
}

export function isAdminEmail(email: string): boolean {
  return getAdminEmails().includes(email.trim().toLowerCase())
}
