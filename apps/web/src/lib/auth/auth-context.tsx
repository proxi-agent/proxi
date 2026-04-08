'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ROLES, type Role, type User } from './rbac'

type AuthContextValue = {
  loginAs: (role: Role) => void
  logout: () => void
  setRole: (role: Role) => void
  user: User | null
}

const STORAGE_KEY = 'proxi.auth.user'

const defaultContext: AuthContextValue = {
  loginAs: () => undefined,
  logout: () => undefined,
  setRole: () => undefined,
  user: null,
}

const AuthContext = createContext<AuthContextValue>(defaultContext)

function getDefaultUser(role: Role): User {
  return {
    email: `${role}@proxi.local`,
    name: role.replaceAll('_', ' '),
    role,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return
    }
    try {
      const parsed = JSON.parse(raw) as User
      if (ROLES.includes(parsed.role)) {
        setUser(parsed)
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      loginAs(role) {
        const nextUser = getDefaultUser(role)
        setUser(nextUser)
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser))
      },
      logout() {
        setUser(null)
        window.localStorage.removeItem(STORAGE_KEY)
      },
      setRole(role) {
        const nextUser = getDefaultUser(role)
        setUser(nextUser)
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser))
      },
      user,
    }),
    [user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
