import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Clasificacion, DepartamentoMedico, TipoExamen } from '@/lib/database.types'

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

// ─── Departamentos Médicos ────────────────────────────────────────────────────

export function useDepartamentosMedicos() {
  return useQuery({
    queryKey: ['catalogos', 'departamentos_medicos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('departamentos_medicos').select('*').order('nombre')
      if (error) throw error
      return data as DepartamentoMedico[]
    },
  })
}

export function useAddDepartamentoMedico() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (nombre: string) => {
      const { error } = await supabase.from('departamentos_medicos').insert({ nombre })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalogos', 'departamentos_medicos'] }),
  })
}

export function useUpdateDepartamentoMedico() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, nombre }: { id: string; nombre: string }) => {
      const { error } = await supabase.from('departamentos_medicos').update({ nombre }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalogos', 'departamentos_medicos'] }),
  })
}

export function useDeleteDepartamentoMedico() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('departamentos_medicos').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalogos', 'departamentos_medicos'] }),
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
