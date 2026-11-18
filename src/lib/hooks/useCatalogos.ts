import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Enfasis, LineaServicio, Servicio, TipoEvaluacion, TipoServicio } from '@/lib/database.types'

// Catálogos de evaluación (migración 019): líneas de servicio, servicios,
// tipos de evaluación y énfasis. Todos los leen; solo el admin los escribe (RLS).

/** Error de negocio: el servicio tiene horarios o citas (trigger de la migración 019). */
export function esErrorServicioEnUso(err: unknown): boolean {
  const e = err as { hint?: string } | null
  return e?.hint === 'SERVICIO_EN_USO'
}

/** "duplicate key" de Postgres: ya existe un registro con ese nombre. */
export function esErrorNombreRepetido(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === '23505'
}

// ─── Líneas de servicio ──────────────────────────────────────────────────────

export function useLineas() {
  return useQuery({
    queryKey: ['catalogos', 'lineas'],
    queryFn: async () => {
      const { data, error } = await supabase.from('lineas_servicio').select('*').order('nombre')
      if (error) throw error
      return data as LineaServicio[]
    },
  })
}

export function useGuardarLinea() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...campos }: { id?: string; nombre?: string; descripcion?: string | null; activo?: boolean }) => {
      const { error } = id
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? await (supabase.from('lineas_servicio') as any).update(campos).eq('id', id)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        : await (supabase.from('lineas_servicio') as any).insert({ nombre: campos.nombre ?? '', descripcion: campos.descripcion ?? null })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['catalogos', 'lineas'] })
      qc.invalidateQueries({ queryKey: ['catalogos', 'servicios'] })
    },
  })
}

export function useDeleteLinea() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('lineas_servicio').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['catalogos', 'lineas'] })
      qc.invalidateQueries({ queryKey: ['catalogos', 'servicios'] })
    },
  })
}

// ─── Servicios ────────────────────────────────────────────────────────────────

export const TIPOS_SERVICIO: { value: TipoServicio; label: string }[] = [
  { value: 'evaluacion_medica', label: 'Evaluación médica' },
  { value: 'prueba_complementaria', label: 'Prueba complementaria' },
  { value: 'imagen', label: 'Imagen' },
  { value: 'terapia', label: 'Terapia' },
]

export function useServicios() {
  return useQuery({
    queryKey: ['catalogos', 'servicios'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('servicios')
        .select('*, lineas:lineas_servicio(id, nombre, activo)')
        .order('nombre')
      if (error) throw error
      return data as Servicio[]
    },
  })
}

export interface ServicioForm {
  id?: string
  nombre: string
  tipo: TipoServicio | null
  preparacion: string | null
  indicaciones: string | null
  duracion_min: number | null
  lineas: string[]
}

export function useGuardarServicio() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (s: ServicioForm) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)('guardar_servicio', {
        p_id: s.id ?? null,
        p_nombre: s.nombre,
        p_tipo: s.tipo,
        p_preparacion: s.preparacion,
        p_indicaciones: s.indicaciones,
        p_duracion_min: s.duracion_min,
        p_lineas: s.lineas,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['catalogos', 'servicios'] })
      qc.invalidateQueries({ queryKey: ['catalogos', 'enfasis'] })
    },
  })
}

export function useDeleteServicio() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('servicios').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['catalogos', 'servicios'] })
      qc.invalidateQueries({ queryKey: ['catalogos', 'enfasis'] })
    },
  })
}

// ─── Tipos de evaluación ──────────────────────────────────────────────────────

export function useTiposEvaluacion() {
  return useQuery({
    queryKey: ['catalogos', 'tipos_evaluacion'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tipos_evaluacion').select('*').order('orden')
      if (error) throw error
      return data as TipoEvaluacion[]
    },
  })
}

export function useUpdateTipoEvaluacion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...campos }: Pick<TipoEvaluacion, 'id' | 'nombre' | 'descripcion' | 'regla' | 'indicaciones' | 'roles_permitidos'>) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('tipos_evaluacion') as any).update(campos).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalogos', 'tipos_evaluacion'] }),
  })
}

// ─── Énfasis ──────────────────────────────────────────────────────────────────

const ENFASIS_KEY = ['catalogos', 'enfasis']

export function useEnfasis() {
  return useQuery({
    queryKey: ENFASIS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('enfasis')
        .select('*, pruebas:enfasis_servicios(servicio_id)')
        .order('orden', { nullsFirst: false })
        .order('nombre')
      if (error) throw error
      return (data as (Omit<Enfasis, 'servicio_ids'> & { pruebas: { servicio_id: string }[] })[]).map(
        ({ pruebas, ...e }) => ({ ...e, servicio_ids: pruebas.map((p) => p.servicio_id) }),
      ) as Enfasis[]
    },
  })
}

export function useGuardarEnfasis() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, nombre, exclusivo }: { id?: string; nombre: string; exclusivo: boolean }) => {
      const { error } = id
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? await (supabase.from('enfasis') as any).update({ nombre, exclusivo }).eq('id', id)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        : await (supabase.from('enfasis') as any).insert({ nombre, exclusivo })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ENFASIS_KEY }),
  })
}

export function useDeleteEnfasis() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('enfasis').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ENFASIS_KEY }),
  })
}

/** Marca o desmarca una prueba de un énfasis. Actualiza la matriz antes de que responda el servidor. */
export function useToggleEnfasisServicio() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ enfasis_id, servicio_id, incluir }: { enfasis_id: string; servicio_id: string; incluir: boolean }) => {
      const { error } = incluir
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? await (supabase.from('enfasis_servicios') as any).insert({ enfasis_id, servicio_id })
        : await supabase.from('enfasis_servicios').delete().eq('enfasis_id', enfasis_id).eq('servicio_id', servicio_id)
      if (error) throw error
    },
    onMutate: async ({ enfasis_id, servicio_id, incluir }) => {
      await qc.cancelQueries({ queryKey: ENFASIS_KEY })
      const previo = qc.getQueryData<Enfasis[]>(ENFASIS_KEY)
      qc.setQueryData<Enfasis[]>(ENFASIS_KEY, (lista) =>
        lista?.map((e) =>
          e.id !== enfasis_id
            ? e
            : { ...e, servicio_ids: incluir ? [...e.servicio_ids, servicio_id] : e.servicio_ids.filter((s) => s !== servicio_id) },
        ),
      )
      return { previo }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previo) qc.setQueryData(ENFASIS_KEY, ctx.previo)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ENFASIS_KEY }),
  })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ORDEN_TIPO: Record<TipoServicio, number> = { evaluacion_medica: 0, prueba_complementaria: 1, imagen: 2, terapia: 3 }

/** Ordena como el resumen de la cita: evaluación médica, pruebas, imágenes, terapias; luego por nombre. */
export function ordenarServicios<T extends Pick<Servicio, 'tipo' | 'nombre'>>(lista: T[]): T[] {
  const orden = (s: T) => (s.tipo ? ORDEN_TIPO[s.tipo] : 9)
  return [...lista].sort((a, b) => orden(a) - orden(b) || a.nombre.localeCompare(b.nombre))
}

/**
 * Pruebas de una evaluación: los servicios de los énfasis elegidos que están en
 * al menos una línea activa. Es la misma regla de crear_cita_interna (migración 020).
 */
export function pruebasDeEnfasis(enfasisIds: string[], enfasis: Enfasis[], servicios: Servicio[]): Servicio[] {
  const ids = new Set(enfasis.filter((e) => enfasisIds.includes(e.id)).flatMap((e) => e.servicio_ids))
  return ordenarServicios(servicios.filter((s) => ids.has(s.id) && s.lineas.some((l) => l.activo)))
}

/** Líneas activas de los servicios que presta una IPS (sus servicios se guardan por nombre). */
export function derivarLineas(nombresServicios: string[], catalogo: Servicio[]): string[] {
  const set = new Set<string>()
  nombresServicios.forEach((n) => {
    catalogo.find((c) => c.nombre === n)?.lineas.forEach((l) => {
      if (l.activo) set.add(l.nombre)
    })
  })
  return Array.from(set)
}
