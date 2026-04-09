import { auth, clerkClient } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

import { defaultPortalPathForRole, isRole, type Role } from '@/lib/auth/rbac'

async function resolveRole(userId: string): Promise<Role> {
  try {
    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    const metadataRole = user.publicMetadata?.['role'] ?? user.unsafeMetadata?.['role']
    return isRole(metadataRole) ? metadataRole : 'shareholder'
  } catch {
    return 'shareholder'
  }
}

export default async function LandingPage() {
  const { userId } = await auth()
  if (!userId) {
    redirect('/login')
  }

  const role = await resolveRole(userId)
  redirect(defaultPortalPathForRole(role))
}
