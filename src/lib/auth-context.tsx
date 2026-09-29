import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import type { Profile } from './database.types'
import { DEPARTAMENTOS } from './colombia'

export type { Profile }
export { DEPARTAMENTOS }

interface RegisterData {
  email: string
  password: string
  role: 'ips' | 'empresa' | 'particular'
  nombre: string
  telefono?: string
  nit?: string
  cedula?: string
  departamento?: string
  ciudad?: string
  lat?: number
  lng?: number
  servicios?: string[]
}

interface AuthCtx {
  profile: Profile | null
  /** Correo de la sesión (vive en auth.users, no en profiles). */
  email: string | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  register: (data: RegisterData) => Promise<void>
  requestPasswordReset: (email: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>
  /** Vuelve a leer el perfil desde Supabase (p. ej. después de editarlo). */
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null)
      if (session?.user) {
        fetchProfile(session.user.id)
      } else {
        setProfile(null)
        setLoading(false)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    setProfile(data)
    setLoading(false)
  }

  const login = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  const logout = async () => {
    await supabase.auth.signOut()
  }

  const register = async (data: RegisterData) => {
    const { error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          role: data.role,
          nombre: data.nombre,
          telefono: data.telefono ?? null,
          nit: data.nit ?? null,
          cedula: data.cedula ?? null,
          departamento: data.departamento ?? null,
          ciudad: data.ciudad ?? null,
          lat: data.lat ?? null,
          lng: data.lng ?? null,
          servicios: data.servicios ?? null,
        }
      }
    })
    if (error) throw error
  }

  const requestPasswordReset = async (email: string) => {
    const { error } = await supabase.functions.invoke('reset-password', {
      body: { email, redirectTo: `${window.location.origin}/reset-password` },
    })
    if (error) throw error
  }

  const refreshProfile = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) await fetchProfile(session.user.id)
  }

  const updatePassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw error
  }

  return (
    <AuthContext.Provider value={{ profile, email, loading, login, logout, register, requestPasswordReset, updatePassword, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
