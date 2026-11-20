import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Appointment, Conversacion, Mensaje, Profile, Resultado } from '@/lib/database.types'

// Mensajes entre el administrador y las IPS (migración 024). El navegador solo
// lee las tablas; todo lo que escribe pasa por funciones SQL.

export type LadoChat = 'admin' | 'ips'

/** Lado del chat de una cuenta, o null si su rol no usa los mensajes. */
export function ladoChat(role: Profile['role'] | undefined): LadoChat | null {
  return role === 'admin' || role === 'ips' ? role : null
}

export type ConversacionConIps = Conversacion & { ips: { nombre: string } | null }

export type EnlaceCita = Pick<Appointment, 'id' | 'empleado_nombre' | 'empleado_cedula' | 'fecha' | 'hora' | 'servicio' | 'estado'>
export type EnlaceResultado = Pick<Resultado, 'id' | 'empleado_nombre' | 'empleado_cedula' | 'fecha' | 'apto'>
export type MensajeConEnlace = Mensaje & { appointment: EnlaceCita | null; resultado: EnlaceResultado | null }

/** Lo que se puede enlazar a un mensaje. */
export type Enlace =
  | { tipo: 'cita'; id: string; cita: EnlaceCita }
  | { tipo: 'resultado'; id: string; resultado: EnlaceResultado }

const CAMPOS_CITA = 'id, empleado_nombre, empleado_cedula, fecha, hora, servicio, estado'
const CAMPOS_RESULTADO = 'id, empleado_nombre, empleado_cedula, fecha, apto'

/** Conversaciones visibles para el usuario (el admin ve todas; la IPS, las suyas). */
export function useConversaciones(userId: string | undefined) {
  return useQuery({
    queryKey: ['conversaciones', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conversaciones')
        .select('*, ips:profiles!ips_id(nombre)')
        .order('ultimo_mensaje_at', { ascending: false })
      if (error) throw error
      return data as unknown as ConversacionConIps[]
    },
    enabled: !!userId,
  })
}

/** Mensajes del otro lado sin leer, contados por conversación. */
export function useNoLeidos(userId: string | undefined, lado: LadoChat | null) {
  return useQuery({
    queryKey: ['mensajes-no-leidos', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mensajes')
        .select('conversacion_id')
        .is('leido_at', null)
        .eq('de_admin', lado === 'ips')
      if (error) throw error
      const porConversacion = new Map<string, number>()
      for (const m of data as { conversacion_id: string }[]) {
        porConversacion.set(m.conversacion_id, (porConversacion.get(m.conversacion_id) ?? 0) + 1)
      }
      return porConversacion
    },
    enabled: !!userId && !!lado,
  })
}

export function totalNoLeidos(porConversacion: Map<string, number> | undefined): number {
  let total = 0
  porConversacion?.forEach((n) => { total += n })
  return total
}

export function useMensajes(conversacionId: string | undefined) {
  return useQuery({
    queryKey: ['mensajes', conversacionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mensajes')
        .select(`*, appointment:appointments(${CAMPOS_CITA}), resultado:resultados(${CAMPOS_RESULTADO})`)
        .eq('conversacion_id', conversacionId!)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as unknown as MensajeConEnlace[]
    },
    enabled: !!conversacionId,
  })
}

/** Citas y resultados de una IPS que se pueden enlazar a un mensaje. */
export function useEnlacesIps(ipsId: string | undefined) {
  return useQuery({
    queryKey: ['enlaces-ips', ipsId],
    queryFn: async () => {
      const [citas, resultados] = await Promise.all([
        supabase.from('appointments').select(CAMPOS_CITA).eq('ips_id', ipsId!)
          .neq('estado', 'expirada')
          .order('fecha', { ascending: false }).order('hora', { ascending: false }).limit(300),
        supabase.from('resultados').select(CAMPOS_RESULTADO).eq('ips_id', ipsId!)
          .order('fecha', { ascending: false }).limit(300),
      ])
      if (citas.error) throw citas.error
      if (resultados.error) throw resultados.error
      return { citas: citas.data as unknown as EnlaceCita[], resultados: resultados.data as unknown as EnlaceResultado[] }
    },
    enabled: !!ipsId,
  })
}

/** IPS registradas, para que el administrador elija con quién hablar. */
export function useIpsParaChat(enabled: boolean) {
  return useQuery({
    queryKey: ['ips-para-chat'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, nombre, ciudad').eq('role', 'ips').order('nombre')
      if (error) throw error
      return data as { id: string; nombre: string; ciudad: string | null }[]
    },
    enabled,
  })
}

/**
 * Tiempo real de conversaciones y mensajes. Montar UNA sola vez (lo hace el
 * layout de /app): igual que en las notificaciones, `supabase.channel()`
 * reutiliza el canal con el mismo nombre. Las reglas RLS filtran los eventos.
 */
export function useMensajesRealtime(userId: string | undefined, lado: LadoChat | null) {
  const qc = useQueryClient()

  useEffect(() => {
    if (!userId || !lado) return
    const channel = supabase
      .channel(`mensajes:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mensajes' }, (payload) => {
        const fila = (payload.new ?? payload.old) as Partial<Mensaje> | undefined
        qc.invalidateQueries({ queryKey: ['mensajes-no-leidos'] })
        if (fila?.conversacion_id) qc.invalidateQueries({ queryKey: ['mensajes', fila.conversacion_id] })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversaciones' }, () => {
        qc.invalidateQueries({ queryKey: ['conversaciones'] })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId, lado, qc])
}

function enlaceParams(enlace: Enlace | null) {
  return {
    p_appointment_id: enlace?.tipo === 'cita' ? enlace.id : null,
    p_resultado_id: enlace?.tipo === 'resultado' ? enlace.id : null,
  }
}

function useRefrescarChat() {
  const qc = useQueryClient()
  return (conversacionId?: string) => {
    qc.invalidateQueries({ queryKey: ['conversaciones'] })
    qc.invalidateQueries({ queryKey: ['mensajes-no-leidos'] })
    if (conversacionId) qc.invalidateQueries({ queryKey: ['mensajes', conversacionId] })
  }
}

export function useIniciarConversacion() {
  const refrescar = useRefrescarChat()
  return useMutation({
    mutationFn: async (v: { ipsId?: string; asunto: string; cuerpo: string; enlace: Enlace | null }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('iniciar_conversacion', {
        p_asunto: v.asunto,
        p_cuerpo: v.cuerpo,
        p_ips_id: v.ipsId ?? null,
        ...enlaceParams(v.enlace),
      })
      if (error) throw error
      return data as string
    },
    onSuccess: (id) => refrescar(id),
  })
}

export function useEnviarMensaje() {
  const refrescar = useRefrescarChat()
  return useMutation({
    mutationFn: async (v: { conversacionId: string; cuerpo: string; enlace: Enlace | null }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)('enviar_mensaje', {
        p_conversacion_id: v.conversacionId,
        p_cuerpo: v.cuerpo,
        ...enlaceParams(v.enlace),
      })
      if (error) throw error
    },
    onSuccess: (_d, v) => refrescar(v.conversacionId),
  })
}

export function useMarcarConversacionLeida() {
  const qc = useQueryClient()
  const refrescar = useRefrescarChat()
  return useMutation({
    mutationFn: async (conversacionId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)('marcar_conversacion_leida', { p_conversacion_id: conversacionId })
      if (error) throw error
    },
    onSuccess: (_d, conversacionId) => {
      refrescar(conversacionId)
      // También marca como leído el aviso de la campanita.
      qc.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}

export function useCambiarEstadoConversacion() {
  const refrescar = useRefrescarChat()
  return useMutation({
    mutationFn: async (v: { conversacionId: string; estado: Conversacion['estado'] }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)('cambiar_estado_conversacion', {
        p_conversacion_id: v.conversacionId,
        p_estado: v.estado,
      })
      if (error) throw error
    },
    onSuccess: (_d, v) => refrescar(v.conversacionId),
  })
}
