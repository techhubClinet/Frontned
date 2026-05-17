/**
 * Create an admin user (or promote existing user to admin).
 * Usage: npx ts-node database/create-admin-user.ts <email> <password> [display name]
 */
import 'dotenv/config'
import { connectDatabase } from '../src/config/database'
import { User } from '../src/models/User'

async function main() {
  const email = process.argv[2]?.trim().toLowerCase()
  const password = process.argv[3]
  const name = process.argv[4]?.trim() || email?.split('@')[0] || 'Admin'

  if (!email || !password) {
    console.error('Usage: npx ts-node database/create-admin-user.ts <email> <password> [name]')
    process.exit(1)
  }

  if (password.length < 6) {
    console.error('Password must be at least 6 characters')
    process.exit(1)
  }

  await connectDatabase()

  let user = await User.findOne({ email })
  if (user) {
    user.role = 'admin'
    user.password = password
    user.name = name
    await user.save()
    console.log(`✅ Updated existing user ${email} → admin (password reset).`)
  } else {
    user = await User.create({
      name,
      email,
      password,
      role: 'admin',
    })
    console.log(`✅ Created admin user ${email}`)
  }

  console.log('   Log in at /login, then open /admin/projects')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
