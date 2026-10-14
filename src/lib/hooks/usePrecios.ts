import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Comision } from '@/lib/database.types'

// Precios por IPS y comisiones (migración 016).
// Empresas y particulares nunca leen el precio base ni el porcentaje: solo el
// total que calculan las funciones `precios_servicios` y `valores_citas`.

/** Error de negocio: el servicio no tiene precio (trigger de la migración 016). */
export function esErrorSinPrecio(err: unknown): boolean {
  const e = err as { hint?: string; message?: string } | null
  return e?.hint === 'SERVICIO_SIN_PRECIO' || /no tiene precio|Define el precio/i.test(e?.message ?? '')
}

// ─── IPS: sus propios precios ─────────────────────────────────────────────────

/** Precios de la IPS indexados por id de servicio. */
export function useMisPrecios(ipsId: string | undefined) {
  return useQuery({
    queryKey: ['precios-ips', ipsId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('precios_ips')
        .select('servicio_id, precio')
        .eq('ips_id', ipsId!)
      if (error) throw error
      return new Map((data as { servicio_id: string; precio: number }[]).map((p) => [p.servicio_id, p.precio]))
    },
    enabled: !!ipsId,
  })
}

/** Guarda los precios: crea o actualiza los que tienen valor y borra los que quedaron vacíos. */
export function useGuardarPrecios() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ ipsId, precios }: { ipsId: string; precios: { servicio_id: string; precio: number | null }[] }) => {
      const conValor = precios.filter((p) => p.precio != null && p.precio > 0)
      const vacios = precios.filter((p) => p.precio == null || p.precio <= 0).map((p) => p.servicio_id)
      if (conValor.length > 0) {
        const now = new Date().toISOString()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.from('precios_ips') as any).upsert(
          conValor.map((p) => ({ ips_id: ipsId, servicio_id: p.servicio_id, precio: p.precio, updated_at: now })),
          { onConflict: 'ips_id,servicio_id' },
        )
        if (error) throw error
      }
      if (vacios.length > 0) {
        const { error } = await supabase.from('precios_ips').delete().eq('ips_id', ipsId).in('servicio_id', vacios)
        if (error) throw error
      }
    },
    onSuccess: (_d, { ipsId }) => qc.invalidateQueries({ queryKey: ['precios-ips', ipsId] }),
  })
}

// ─── Empresa / particular: valor final ────────────────────────────────────────

export const precioKey = (ipsId: string, servicio: string) => `${ipsId}|${servicio}`

/**
 * Valor final (precio + comisión) de cada servicio de las IPS indicadas, para
 * el tipo de cuenta de quien consulta. Clave: `precioKey(ips_id, servicio)`.
 * Los servicios sin precio no aparecen: sus horarios no se pueden agendar.
 */
export function usePreciosServicios(ipsIds: string[]) {
  const ids = [...ipsIds].sort()
  return useQuery({
    queryKey: ['precios-servicios', ids],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('precios_servicios', { p_ips_ids: ids })
      if (error) throw error
      return new Map(
        (data as { ips_id: string; servicio: string; total: number }[]).map((p) => [precioKey(p.ips_id, p.servicio), p.total]),
      )
    },
    enabled: ids.length > 0,
    staleTime: 0,
    refetchOnMount: 'always',
  })
}

/**
 * Valor de cada cita del usuario: el total para quien la solicitó y el precio
 * base para la IPS. Las citas anteriores a los precios no aparecen.
 */
export function useValoresCitas(enabled: boolean) {
  return useQuery({
    queryKey: ['valores-citas'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('valores_citas')
      if (error) throw error
      return new Map((data as { appointment_id: string; valor: number }[]).map((v) => [v.appointment_id, v.valor]))
    },
    enabled,
  })
}

// ─── Admin: comisiones ────────────────────────────────────────────────────────

export function useComisiones() {
  return useQuery({
    queryKey: ['comisiones'],
    queryFn: async () => {
      const { data, error } = await supabase.from('comisiones').select('*').order('created_at')
      if (error) throw error
      return data as Comision[]
    },
  })
}

type NuevaComision = Pick<Comision, 'ips_id' | 'servicio_id' | 'rol' | 'porcentaje'>

export function useAddComision() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (c: NuevaComision) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('comisiones') as any).insert(c)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comisiones'] }),
  })
}

export function useUpdateComision() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, porcentaje }: { id: string; porcentaje: number }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('comisiones') as any).update({ porcentaje }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comisiones'] }),
  })
}

export function useDeleteComision() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('comisiones').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comisiones'] }),
  })
}
