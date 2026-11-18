import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Cargo, Empleado, TipoDoc } from '@/lib/database.types'

// Directorio de cada empresa (migración 022): sus cargos, con los énfasis que
// definen las pruebas, y sus empleados. RLS: cada empresa solo ve lo suyo.

export const TIPOS_DOC: { value: TipoDoc; label: string }[] = [
  { value: 'CC', label: 'Cédula de ciudadanía' },
  { value: 'CE', label: 'Cédula de extranjería' },
  { value: 'TI', label: 'Tarjeta de identidad' },
  { value: 'PA', label: 'Pasaporte' },
  { value: 'PPT', label: 'Permiso por protección temporal' },
]

/** Pasaporte y PPT pueden tener letras; los demás documentos, solo dígitos. */
export function errorDocumento(tipo: TipoDoc | string, numero: string): string | null {
  const n = numero.trim()
  if (!n) return 'Escribe el número de documento.'
  if (tipo === 'PA' || tipo === 'PPT') return /^[A-Za-z0-9]{4,20}$/.test(n) ? null : 'Usa entre 4 y 20 letras o números.'
  return /^\d{5,12}$/.test(n) ? null : 'Usa solo números, entre 5 y 12 dígitos.'
}

export const errorCelular = (v: string) => (!v.trim() || /^3\d{9}$/.test(v.replace(/\s/g, '')) ? null : 'Escribe un celular de 10 dígitos que empiece por 3.')
export const errorCorreo = (v: string) => (!v.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? null : 'Escribe un correo válido.')

export const nombreCompleto = (e: Pick<Empleado, 'nombres' | 'apellidos'>) => `${e.nombres} ${e.apellidos}`.trim()

/** "1020345678" → "1.020.345.678" (solo documentos numéricos). */
export const formatDocumento = (numero: string) => (/^\d+$/.test(numero) ? Number(numero).toLocaleString('es-CO') : numero)

// ─── Cargos ───────────────────────────────────────────────────────────────────

export function useCargos(empresaId: string | undefined) {
  return useQuery({
    queryKey: ['cargos', empresaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cargos')
        .select('*, enfasis:cargo_enfasis(enfasis_id)')
        .eq('empresa_id', empresaId!)
        .order('nombre')
      if (error) throw error
      return (data as (Omit<Cargo, 'enfasis_ids'> & { enfasis: { enfasis_id: string }[] })[]).map(
        ({ enfasis, ...c }) => ({ ...c, enfasis_ids: enfasis.map((e) => e.enfasis_id) }),
      ) as Cargo[]
    },
    enabled: !!empresaId,
  })
}

export function useGuardarCargo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, nombre, enfasis_ids }: { id?: string; nombre: string; enfasis_ids: string[] }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('guardar_cargo', { p_id: id ?? null, p_nombre: nombre, p_enfasis: enfasis_ids })
      if (error) throw error
      return data as string
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cargos'] }),
  })
}

export function useDeleteCargo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('cargos').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cargos'] })
      qc.invalidateQueries({ queryKey: ['empleados'] })
    },
  })
}

// ─── Empleados ────────────────────────────────────────────────────────────────

export function useEmpleados(empresaId: string | undefined) {
  return useQuery({
    queryKey: ['empleados', empresaId],
    queryFn: async () => {
      const { data, error } = await supabase.from('empleados').select('*').eq('empresa_id', empresaId!).order('nombres').order('apellidos')
      if (error) throw error
      return data as Empleado[]
    },
    enabled: !!empresaId,
  })
}

export type EmpleadoForm = Omit<Empleado, 'id' | 'created_at' | 'empresa_id'>

export function useGuardarEmpleado(empresaId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...campos }: EmpleadoForm & { id?: string }) => {
      const { data, error } = id
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? await (supabase.from('empleados') as any).update(campos).eq('id', id).select('*').single()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        : await (supabase.from('empleados') as any).insert({ ...campos, empresa_id: empresaId }).select('*').single()
      if (error) throw error
      return data as Empleado
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['empleados'] }),
  })
}

export function useDeleteEmpleado() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('empleados').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['empleados'] }),
  })
}

// ─── Admin ────────────────────────────────────────────────────────────────────

export function useActualizarDiasCredito() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ empresaId, dias }: { empresaId: string; dias: number }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('profiles') as any).update({ dias_credito: dias }).eq('id', empresaId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  })
}
