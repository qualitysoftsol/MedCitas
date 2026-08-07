import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Slot } from '@/lib/database.types'

export function useSlots(ipsId: string | undefined) {
  return useQuery({
    queryKey: ['slots', ipsId],
    queryFn: async () => {
      if (!ipsId) return []
      const { data, error } = await supabase
        .from('slots')
        .select('*')
        .eq('ips_id', ipsId)
        .order('fecha')
        .order('hora')
      if (error) throw error
      return data as Slot[]
    },
    enabled: !!ipsId,
  })
}

export function useAvailableSlots(ipsId: string | null) {
  return useQuery({
    queryKey: ['slots', 'available', ipsId],
    queryFn: async () => {
      if (!ipsId) return []
      const { data, error } = await supabase
        .from('slots')
        .select('*')
        .eq('ips_id', ipsId)
        .eq('taken', false)
        .order('fecha')
        .order('hora')
      if (error) throw error
      return data as Slot[]
    },
    enabled: !!ipsId,
  })
}

type NewSlot = Omit<Slot, 'id' | 'created_at' | 'taken'>

export function useAddSlots() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (slots: NewSlot[]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from('slots').insert(slots as any)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['slots'] })
    },
  })
}
