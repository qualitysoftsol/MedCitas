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
    staleTime: 0,
    refetchOnMount: 'always',
  })
}

/** Error de negocio: el horario fue agendado mientras se editaba. */
export class SlotTakenError extends Error {
  constructor() {
    super('Este horario acaba de ser agendado y ya no se puede modificar.')
    this.name = 'SlotTakenError'
  }
}

type SlotPatch = Pick<Slot, 'fecha' | 'hora' | 'servicio'>

/**
 * Edita un horario libre. El filtro `taken = false` en la misma consulta evita
 * modificar un horario que alguien agendó entre la carga y el guardado.
 */
export function useUpdateSlot() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: SlotPatch }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('slots') as any)
        .update(patch)
        .eq('id', id)
        .eq('taken', false)
        .select('id')
      if (error) throw error
      if (!data || data.length === 0) throw new SlotTakenError()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['slots'] }),
  })
}

/**
 * Elimina un horario libre. Falla con código 23503 si el horario tiene citas
 * canceladas asociadas (la FK appointments.slot_id conserva el historial).
 */
export function useDeleteSlot() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('slots')
        .delete()
        .eq('id', id)
        .eq('taken', false)
        .select('id')
      if (error) throw error
      if (!data || data.length === 0) throw new SlotTakenError()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['slots'] }),
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
