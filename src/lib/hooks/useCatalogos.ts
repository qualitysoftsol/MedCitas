import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Clasificacion, Servicio, TipoExamen } from '@/lib/database.types'

// ─── Clasificaciones ─────────────────────────────────────────────────────────

export function useClasificaciones() {
  return useQuery({
    queryKey: ['catalogos', 'clasificaciones'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clasificaciones').select('*').order('nombre')
      if (error) throw error
      return data as Clasificacion[]
    },
  })
}

export function useAddClasificacion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (nombre: string) => {
      const { error } = await supabase.from('clasificaciones').insert({ nombre })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalogos', 'clasificaciones'] }),
  })
}

export function useUpdateClasificacion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, nombre }: { id: string; nombre: string }) => {
      const { error } = await supabase.from('clasificaciones').update({ nombre }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalogos', 'clasificaciones'] }),
  })
}

export function useDeleteClasificacion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('clasificaciones').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalogos', 'clasificaciones'] }),
  })
}

// ─── Servicios ────────────────────────────────────────────────────────────────

export function useServicios() {
  return useQuery({
    queryKey: ['catalogos', 'servicios'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('servicios')
        .select('*, clasificacion:clasificaciones(id, nombre)')
        .order('nombre')
      if (error) throw error
      return data as Servicio[]
    },
  })
}

export function useAddServicio() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (nombre: string) => {
      const { error } = await supabase.from('servicios').insert({ nombre })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalogos', 'servicios'] }),
  })
}

export function useUpdateServicio() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, nombre, clasificacion_id }: { id: string; nombre: string; clasificacion_id: string | null }) => {
      const { error } = await supabase.from('servicios').update({ nombre, clasificacion_id }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalogos', 'servicios'] }),
  })
}

export function useDeleteServicio() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('servicios').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalogos', 'servicios'] }),
  })
}

// ─── Tipos de Examen ──────────────────────────────────────────────────────────

export function useTiposExamen() {
  return useQuery({
    queryKey: ['catalogos', 'tipos_examen'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tipos_examen').select('*').order('nombre')
      if (error) throw error
      return data as TipoExamen[]
    },
  })
}

export function useAddTipoExamen() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (nombre: string) => {
      const { error } = await supabase.from('tipos_examen').insert({ nombre })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalogos', 'tipos_examen'] }),
  })
}

export function useUpdateTipoExamen() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, nombre, roles_permitidos }: { id: string; nombre: string; roles_permitidos: string[] }) => {
      const { error } = await supabase.from('tipos_examen').update({ nombre, roles_permitidos }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalogos', 'tipos_examen'] }),
  })
}

export function useDeleteTipoExamen() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tipos_examen').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalogos', 'tipos_examen'] }),
  })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function derivarClasificaciones(
  nombresServicios: string[],
  catalogo: Servicio[]
): string[] {
  const set = new Set<string>()
  nombresServicios.forEach((n) => {
    const s = catalogo.find((c) => c.nombre === n)
    if (s?.clasificacion?.nombre) set.add(s.clasificacion.nombre)
  })
  return Array.from(set)
}
