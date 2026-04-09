'use client'

import { useAuth as useClerkAuth, useUser } from '@clerk/nextjs'
import type { ReactNode } from 'react'
import { createContext, useCallback, useContext, useEffect, useMemo } from 'react'

import { isRole, type Role, type User } from './rbac'

type AuthContextValue = {
  getToken: () => Promise<string | null>
  isLoaded: boolean
  loginAs: (role: Role) => Promise<void>
  logout: () => Promise<void>
  setRole: (role: Role) => Promise<void>
  user: User | null
}

const defaultContext: AuthContextValue = {
  getToken: async () => null,
  isLoaded: false,
  loginAs: async () => undefined,
  logout: async () => undefined,
  setRole: async () => undefined,
  user: null,
}

const AuthContext = createContext<AuthContextValue>(defaultContext)

export function AuthProvider({ children }: { children: ReactNode }) {
  const { getToken, isLoaded: authLoaded, signOut } = useClerkAuth()
  const { isLoaded: userLoaded, user: clerkUser } = useUser()

  const persistRole = useCallback(async (role: Role): Promise<void> => {
    if (!clerkUser) {
      return
    }
    await clerkUser.update({
      unsafeMetadata: {
        ...(clerkUser.unsafeMetadata || {}),
        role,
      },
    })
  }, [clerkUser])

  useEffect(() => {
    if (!authLoaded || !userLoaded || !clerkUser) {
      return
    }
    const metadataRole = clerkUser.publicMetadata?.role ?? clerkUser.unsafeMetadata?.role
    if (isRole(metadataRole)) {
      return
    }
    void persistRole('shareholder')
  }, [authLoaded, clerkUser, persistRole, userLoaded])

  const value = useMemo<AuthContextValue>(() => {
    const metadataRole = clerkUser?.publicMetadata?.role ?? clerkUser?.unsafeMetadata?.role
    const role: Role = isRole(metadataRole) ? metadataRole : 'shareholder'
    const currentUser: User | null = clerkUser
      ? {
          email: clerkUser.primaryEmailAddress?.emailAddress || `${clerkUser.id}@unknown.local`,
          name: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || clerkUser.username || 'Unknown user',
          role,
        }
      : null

    return {
      async getToken() {
        return getToken()
      },
      isLoaded: authLoaded && userLoaded,
      async loginAs(nextRole) {
        await persistRole(nextRole)
      },
      async logout() {
        await signOut({ redirectUrl: '/login' })
      },
      async setRole(nextRole) {
        await persistRole(nextRole)
      },
      user: currentUser,
    }
  }, [authLoaded, clerkUser, getToken, persistRole, signOut, userLoaded])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
