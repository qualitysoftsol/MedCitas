import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Appointment } from '@/lib/database.types'

export type AppointmentIps = {
  nombre: string
  direccion: string | null
  telefono: string | null
  lat: number | null
  lng: number | null
}

export type AppointmentWithNames = Appointment & {
  ips: AppointmentIps | null
  solicitante: { nombre: string } | null
}

export function useAppointments(userId: string | undefined, role: string | undefined) {
  return useQuery({
    queryKey: ['appointments', userId],
    queryFn: async () => {
      if (!userId) return []
      let query = supabase
        .from('appointments')
        .select('*, ips:profiles!ips_id(nombre, direccion, telefono, lat, lng), solicitante:profiles!solicitante_id(nombre)')
        .order('fecha', { ascending: false })
        .order('hora', { ascending: false })

      if (role === 'ips') {
        query = query.eq('ips_id', userId)
      } else {
        query = query.eq('solicitante_id', userId)
      }

      const { data, error } = await query
      if (error) throw error
      return data as AppointmentWithNames[]
    },
    enabled: !!userId,
  })
}

type BookData = Omit<Appointment, 'id' | 'created_at' | 'estado'>

export function useBookAppointment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (appt: BookData) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('appointments') as any).insert(appt)
      if (error) throw error
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: slotError } = await (supabase.from('slots') as any).update({ taken: true }).eq('id', appt.slot_id)
      if (slotError) throw slotError
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['appointments'] })
      qc.invalidateQueries({ queryKey: ['slots', 'available', variables.ips_id] })
      qc.invalidateQueries({ queryKey: ['slots', variables.ips_id] })
    },
  })
}

export function useCancelAppointment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, slotId }: { id: string; slotId: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('appointments') as any)
        .update({ estado: 'cancelada' })
        .eq('id', id)
      if (error) throw error
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: slotError } = await (supabase.from('slots') as any).update({ taken: false }).eq('id', slotId)
      if (slotError) throw slotError
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments'] })
      qc.invalidateQueries({ queryKey: ['slots'] })
    },
  })
}

export function useBookAppointmentsBatch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (citas: BookData[]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('appointments') as any).insert(citas)
      if (error) throw error
      const slotIds = citas.map((c) => c.slot_id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: slotError } = await (supabase.from('slots') as any)
        .update({ taken: true })
        .in('id', slotIds)
      if (slotError) throw slotError
    },
    onSuccess: (_data, citas) => {
      qc.invalidateQueries({ queryKey: ['appointments'] })
      const ipsId = citas[0]?.ips_id
      if (ipsId) qc.invalidateQueries({ queryKey: ['slots', 'available', ipsId] })
      if (ipsId) qc.invalidateQueries({ queryKey: ['slots', ipsId] })
    },
  })
}
