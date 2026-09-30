import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Notification } from '@/lib/database.types'

/**
 * Lista de notificaciones del usuario. Se puede usar en varios componentes a la
 * vez: todos comparten la misma consulta en caché. La actualización en tiempo
 * real vive aparte, en `useNotificationsRealtime`, que se monta una sola vez.
 */
export function useNotifications(userId: string | undefined) {
  return useQuery({
    queryKey: ['notifications', userId],
    queryFn: async () => {
      if (!userId) return []
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Notification[]
    },
    enabled: !!userId,
  })
}

/**
 * Suscripción en tiempo real a notificaciones nuevas. Montar UNA sola vez
 * (lo hace la campana del header): `supabase.channel()` reutiliza el canal con
 * el mismo nombre, y añadir callbacks a un canal ya suscrito lanza un error.
 */
export function useNotificationsRealtime(userId: string | undefined) {
  const qc = useQueryClient()

  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        () => { qc.invalidateQueries({ queryKey: ['notifications', userId] }) }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId, qc])
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (userId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('notifications') as any)
        .update({ read: true })
        .eq('user_id', userId)
        .eq('read', false)
      if (error) throw error
    },
    onSuccess: (_data, userId) => {
      qc.invalidateQueries({ queryKey: ['notifications', userId] })
    },
  })
}

export function useMarkNotificationRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string; userId: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('notifications') as any)
        .update({ read: true })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, { userId }) => {
      qc.invalidateQueries({ queryKey: ['notifications', userId] })
    },
  })
}

export function useClearNotifications() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (userId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('notifications') as any)
        .delete()
        .eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: (_data, userId) => {
      qc.invalidateQueries({ queryKey: ['notifications', userId] })
    },
  })
}
