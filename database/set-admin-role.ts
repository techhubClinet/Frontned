/**
 * Promote a user to admin by email.
 * Usage: npx ts-node database/set-admin-role.ts izan@madebyizan.com
 */
import 'dotenv/config'
import { connectDatabase } from '../src/config/database'
import { User } from '../src/models/User'
import { isAdminEmail } from '../src/config/adminEmails'

async function main() {
  const emailArg = process.argv[2]?.trim().toLowerCase()
  if (!emailArg) {
    console.error('Usage: npx ts-node database/set-admin-role.ts <email>')
    process.exit(1)
  }

  if (!isAdminEmail(emailArg)) {
    console.warn(
      `Warning: ${emailArg} is not in ADMIN_EMAILS / default admin list. Promoting anyway.`
    )
  }

  await connectDatabase()

  const user = await User.findOne({ email: emailArg })
  if (!user) {
    console.error(
      `No user found for ${emailArg}. Ask them to sign up at /signup first, then run this script again.`
    )
    process.exit(1)
  }

  if (user.role === 'admin') {
    console.log(`✅ ${emailArg} already has admin role.`)
    process.exit(0)
  }

  user.role = 'admin'
  await user.save()
  console.log(`✅ ${emailArg} is now an admin. They can log in and open /admin/projects`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
