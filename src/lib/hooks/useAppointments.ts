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
        // Las reservas que vencieron sin pagar no son citas: no se muestran.
        .neq('estado', 'expirada')
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

export type Solicitante = { id: string; nombre: string; role: 'empresa' | 'particular' | 'ips' | 'admin' }

/**
 * Para la IPS: nombre y tipo de cuenta de quienes le agendaron citas.
 * Usa la función `solicitantes_de_ips` (migración 015) porque la IPS no puede
 * leer directamente los perfiles de empresas y particulares.
 */
export function useSolicitantes(enabled: boolean) {
  return useQuery({
    queryKey: ['solicitantes-de-ips'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('solicitantes_de_ips')
      if (error) throw error
      return new Map((data as Solicitante[]).map((s) => [s.id, s]))
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  })
}

// Las citas de empresa se crean con agendar_cita_empresa y agendar_lote_empresa
// (migración 020): la base de datos calcula las pruebas, el precio y ocupa el cupo.

/** Error de negocio al agendar: código (HINT) y, en HORARIO_TOMADO de un lote, los cupos ya ocupados. */
export function errorAgendar(err: unknown): { codigo?: string; mensaje: string; cuposTomados: string[] } {
  const e = err as { hint?: string; message?: string; details?: string } | null
  return {
    codigo: e?.hint,
    mensaje: e?.message ?? '',
    cuposTomados: e?.hint === 'HORARIO_TOMADO' && e.details ? e.details.split(',') : [],
  }
}

/** Una cita de un empleado del directorio (agendar_cita_empresa, migración 022). */
export interface CitaEmpresa {
  empleado_id: string
  slot_id: string
  enfasis_ids: string[]
  cargo: string | null
  /** Datos que pide el tipo de evaluación (ver lib/datosEvaluacion). */
  datos: Record<string, unknown>
}

/** Una fila del archivo (agendar_lote_empresa): crea o actualiza el empleado; los énfasis salen del cargo. */
export interface FilaLote {
  slot_id: string
  tipo_doc: string
  numero: string
  nombres: string
  apellidos: string
  cargo_id: string
  celular: string | null
  correo: string | null
  fecha_retiro: string | null
}

function invalidarCitas(qc: ReturnType<typeof useQueryClient>, ipsId: string | null) {
  qc.invalidateQueries({ queryKey: ['appointments'] })
  qc.invalidateQueries({ queryKey: ['valores-citas'] })
  qc.invalidateQueries({ queryKey: ['pagos-citas'] })
  qc.invalidateQueries({ queryKey: ['slots', 'available', ipsId] })
  qc.invalidateQueries({ queryKey: ['slots', ipsId] })
}

export function useAgendarCitaEmpresa() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ cita, tipo_evaluacion, avisar }: { cita: CitaEmpresa; tipo_evaluacion: string; avisar: boolean; ips_id: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('agendar_cita_empresa', {
        p_empleado_id: cita.empleado_id,
        p_slot_id: cita.slot_id,
        p_tipo_evaluacion: tipo_evaluacion,
        p_datos: cita.datos,
        p_enfasis_ids: cita.enfasis_ids,
        p_cargo: cita.cargo,
        p_avisar: avisar,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: (_data, { ips_id }) => invalidarCitas(qc, ips_id),
  })
}

export function useAgendarLoteEmpresa() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ filas, tipo_evaluacion, avisar }: { filas: FilaLote[]; tipo_evaluacion: string; avisar: boolean; ips_id: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('agendar_lote_empresa', {
        p_tipo_evaluacion: tipo_evaluacion,
        p_avisar: avisar,
        p_citas: filas,
      })
      if (error) throw error
      return data as number
    },
    onSuccess: (_data, { ips_id }) => {
      invalidarCitas(qc, ips_id)
      qc.invalidateQueries({ queryKey: ['empleados'] })
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
      qc.invalidateQueries({ queryKey: ['valores-citas'] })
      qc.invalidateQueries({ queryKey: ['pagos-citas'] })
      qc.invalidateQueries({ queryKey: ['slots'] })
    },
  })
}
