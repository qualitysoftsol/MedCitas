import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { FacturaEmpresa, LiquidacionIps } from '@/lib/database.types'

// Facturas mensuales de empresas y pagos mensuales a las IPS (migración 018).
// El admin las genera por mes; la empresa consulta las suyas.

/** "2026-10" → "2026-10-01" (el periodo se guarda como el primer día del mes). */
export const periodoDeMes = (mes: string) => `${mes}-01`

export type FacturaConEmpresa = FacturaEmpresa & { empresa: { nombre: string; nit: string | null } | null }

/** Admin: todas las facturas del mes. Empresa: todas las suyas (RLS). */
export function useFacturas(periodo?: string) {
  return useQuery({
    queryKey: ['facturas', periodo ?? 'todas'],
    queryFn: async () => {
      let q = supabase
        .from('facturas_empresa')
        .select('*, empresa:profiles!empresa_id(nombre, nit)')
        .order('periodo', { ascending: false })
      if (periodo) q = q.eq('periodo', periodo)
      const { data, error } = await q
      if (error) throw error
      return data as FacturaConEmpresa[]
    },
  })
}

export type ItemCita = {
  appointment_id: string
  valor: number
  cita: { fecha: string; hora: string; servicio: string; tipo_examen: string; empleado_nombre: string; empleado_cedula: string; estado: string; ips: { nombre: string } | null } | null
}

const SELECT_ITEM = 'appointment_id, valor, cita:appointments(fecha, hora, servicio, tipo_examen, empleado_nombre, empleado_cedula, estado, ips:profiles!ips_id(nombre))'

/** Citas incluidas en una factura. */
export function useFacturaItems(facturaId: string | null) {
  return useQuery({
    queryKey: ['factura-items', facturaId],
    queryFn: async () => {
      const { data, error } = await supabase.from('facturas_empresa_items').select(SELECT_ITEM).eq('factura_id', facturaId!)
      if (error) throw error
      return ordenarItems(data as unknown as ItemCita[])
    },
    enabled: !!facturaId,
  })
}

function ordenarItems(items: ItemCita[]) {
  return items.sort((a, b) => `${a.cita?.fecha}${a.cita?.hora}`.localeCompare(`${b.cita?.fecha}${b.cita?.hora}`))
}

export function useGenerarFacturas() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (periodo: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('generar_facturas_empresas', { p_periodo: periodo })
      if (error) throw error
      return data as number
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['facturas'] })
      qc.invalidateQueries({ queryKey: ['factura-items'] })
    },
  })
}

export function useActualizarFactura() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, cambios }: { id: string; cambios: Partial<Pick<FacturaEmpresa, 'estado' | 'numero' | 'pdf_path'>> }) => {
      const patch = {
        ...cambios,
        ...(cambios.estado ? { pagada_at: cambios.estado === 'pagada' ? new Date().toISOString() : null } : {}),
        updated_at: new Date().toISOString(),
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('facturas_empresa') as any).update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['facturas'] }),
  })
}

/** Ruta del PDF en el bucket privado `facturas`: <empresa_id>/<YYYY-MM>.pdf */
export const rutaPdfFactura = (f: Pick<FacturaEmpresa, 'empresa_id' | 'periodo'>) => `${f.empresa_id}/${f.periodo.slice(0, 7)}.pdf`

export function useSubirPdfFactura() {
  const actualizar = useActualizarFactura()
  return useMutation({
    mutationFn: async ({ factura, archivo }: { factura: FacturaEmpresa; archivo: File }) => {
      const ruta = rutaPdfFactura(factura)
      const { error } = await supabase.storage.from('facturas').upload(ruta, archivo, { upsert: true, contentType: 'application/pdf' })
      if (error) throw error
      await actualizar.mutateAsync({ id: factura.id, cambios: { pdf_path: ruta } })
    },
  })
}

/** Abre el PDF de la factura con un enlace temporal (el bucket es privado). */
export async function abrirPdfFactura(ruta: string) {
  const { data, error } = await supabase.storage.from('facturas').createSignedUrl(ruta, 300)
  if (error || !data) throw error ?? new Error('No se pudo abrir el PDF')
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
}

// ─── Pagos a IPS ──────────────────────────────────────────────────────────────

export type LiquidacionConIps = LiquidacionIps & { ips: { nombre: string; nit: string | null } | null }

export function useLiquidaciones(periodo: string) {
  return useQuery({
    queryKey: ['liquidaciones', periodo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('liquidaciones_ips')
        .select('*, ips:profiles!ips_id(nombre, nit)')
        .eq('periodo', periodo)
      if (error) throw error
      return (data as LiquidacionConIps[]).sort((a, b) => (a.ips?.nombre ?? '').localeCompare(b.ips?.nombre ?? ''))
    },
  })
}

export function useLiquidacionItems(liquidacionId: string | null) {
  return useQuery({
    queryKey: ['liquidacion-items', liquidacionId],
    queryFn: async () => {
      const { data, error } = await supabase.from('liquidaciones_ips_items').select(SELECT_ITEM).eq('liquidacion_id', liquidacionId!)
      if (error) throw error
      return ordenarItems(data as unknown as ItemCita[])
    },
    enabled: !!liquidacionId,
  })
}

export function useGenerarLiquidaciones() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (periodo: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('generar_liquidaciones_ips', { p_periodo: periodo })
      if (error) throw error
      return data as number
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['liquidaciones'] })
      qc.invalidateQueries({ queryKey: ['liquidacion-items'] })
    },
  })
}

export function useActualizarLiquidacion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, estado }: { id: string; estado: LiquidacionIps['estado'] }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('liquidaciones_ips') as any)
        .update({ estado, pagada_at: estado === 'pagada' ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['liquidaciones'] }),
  })
}
