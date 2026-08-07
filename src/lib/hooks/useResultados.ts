import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Resultado } from '@/lib/database.types'

export function useResultados(userId: string | undefined, role: string | undefined) {
  return useQuery({
    queryKey: ['resultados', userId],
    queryFn: async () => {
      if (!userId) return []
      let query = supabase.from('resultados').select('*').order('created_at', { ascending: false })
      if (role === 'ips') {
        query = query.eq('ips_id', userId)
      } else {
        query = query.eq('solicitante_id', userId)
      }
      const { data, error } = await query
      if (error) throw error
      return data as Resultado[]
    },
    enabled: !!userId,
  })
}

type NewResultado = Omit<Resultado, 'id' | 'created_at'>

export function useAddResultado() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (r: NewResultado) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('resultados') as any).insert(r)
      if (error) throw error
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('appointments') as any).update({ estado: 'atendida' }).eq('id', r.appointment_id)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['resultados'] })
      qc.invalidateQueries({ queryKey: ['appointments'] })
    },
  })
}
