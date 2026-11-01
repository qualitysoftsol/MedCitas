import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Pago, Reembolso } from '@/lib/database.types'

// Pagos en línea de particulares con Rapyd (migración 018 y Edge Functions
// rapyd-checkout, rapyd-webhook y rapyd-reembolso).

/** Error con el mensaje y el código que devuelve una Edge Function. */
export class PagoError extends Error {
  constructor(message: string, public codigo?: string) {
    super(message)
    this.name = 'PagoError'
  }
}

async function invocar<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body })
  if (error) {
    // FunctionsHttpError trae la respuesta: se extrae el mensaje en español.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = (error as any).context as Response | undefined
    const detalle = ctx ? await ctx.json().catch(() => null) : null
    if (detalle?.pasarela) console.warn(`[${fn}] respuesta de la pasarela:`, detalle.pasarela)
    throw new PagoError(detalle?.error ?? 'No pudimos conectar con el servidor. Inténtalo de nuevo.', detalle?.codigo)
  }
  return data as T
}

type NuevaReserva = { slot_id: string; empleado_cedula: string; tipo_examen: string }

/**
 * Crea la reserva (o reintenta el pago de una existente) y devuelve la URL de
 * la página de pago de Rapyd a la que se redirige al usuario.
 */
export function useIniciarPago() {
  return useMutation({
    mutationFn: (args: NuevaReserva | { appointment_id: string }) =>
      invocar<{ pago_id: string; redirect_url: string }>('rapyd-checkout', args),
  })
}

export type PagoConCita = Pago & {
  cita: { estado: string; fecha: string; hora: string; servicio: string; tipo_examen: string; ips: { nombre: string; direccion: string | null } | null } | null
}

/** Estado de un pago; se consulta cada pocos segundos mientras llega el webhook. */
export function usePago(pagoId: string | undefined) {
  return useQuery({
    queryKey: ['pago', pagoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pagos')
        .select('*, cita:appointments(estado, fecha, hora, servicio, tipo_examen, ips:profiles!ips_id(nombre, direccion))')
        .eq('id', pagoId!)
        .maybeSingle()
      if (error) throw error
      return data as PagoConCita | null
    },
    enabled: !!pagoId,
    refetchInterval: (q) => {
      const p = q.state.data as PagoConCita | null | undefined
      const final = p && (p.estado === 'aprobado' || p.estado === 'expirado' || p.cita?.estado !== 'pendiente_pago')
      return final ? false : 3000
    },
  })
}

export type PagoDeCita = Pick<Pago, 'id' | 'estado' | 'monto' | 'expira_at' | 'metodo'> & {
  reembolso: Pick<Reembolso, 'estado' | 'motivo' | 'detalle'> | null
}

/** Pago y reembolso de cada cita del particular, por id de cita. */
export function usePagosDeCitas(enabled: boolean) {
  return useQuery({
    queryKey: ['pagos-citas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pagos')
        .select('id, appointment_id, estado, monto, expira_at, metodo, reembolsos(estado, motivo, detalle)')
      if (error) throw error
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return new Map((data as any[]).map((p) => [p.appointment_id as string, { ...p, reembolso: p.reembolsos?.[0] ?? p.reembolsos ?? null } as PagoDeCita]))
    },
    enabled,
  })
}

// ─── Admin: reembolsos ────────────────────────────────────────────────────────

export type ReembolsoAdmin = Reembolso & {
  pago: (Pick<Pago, 'monto' | 'metodo' | 'rapyd_payment_id'> & {
    cita: { fecha: string; hora: string; servicio: string; empleado_nombre: string; empleado_cedula: string; ips: { nombre: string } | null } | null
  }) | null
}

export function useReembolsos() {
  return useQuery({
    queryKey: ['admin', 'reembolsos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reembolsos')
        .select('*, pago:pagos(monto, metodo, rapyd_payment_id, cita:appointments(fecha, hora, servicio, empleado_nombre, empleado_cedula, ips:profiles!ips_id(nombre)))')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as ReembolsoAdmin[]
    },
  })
}

export function useResolverReembolso() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { reembolso_id: string; accion: 'aprobar' | 'denegar'; nota?: string }) =>
      invocar<{ estado: Reembolso['estado'] }>('rapyd-reembolso', args),
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin', 'reembolsos'] }),
  })
}
