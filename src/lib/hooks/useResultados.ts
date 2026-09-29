import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Resultado } from '@/lib/database.types'

export type ResultadoConDetalle = Resultado & {
  ips: { nombre: string; direccion: string | null } | null
  appointment: { servicio: string; tipo_examen: string; hora: string; ciudad: string } | null
}

export function useResultados(userId: string | undefined, role: string | undefined) {
  return useQuery({
    queryKey: ['resultados', userId],
    queryFn: async () => {
      if (!userId) return []
      let query = supabase
        .from('resultados')
        .select('*, ips:profiles!ips_id(nombre, direccion), appointment:appointments(servicio, tipo_examen, hora, ciudad)')
        .order('created_at', { ascending: false })
      if (role === 'ips') {
        query = query.eq('ips_id', userId)
      } else {
        query = query.eq('solicitante_id', userId)
      }
      const { data, error } = await query
      if (error) throw error
      return data as unknown as ResultadoConDetalle[]
    },
    enabled: !!userId,
  })
}

/**
 * URL firmada (1 h) del PDF de un resultado, pedida en el momento del clic.
 * Con `download` el navegador descarga el archivo en vez de abrirlo.
 */
export async function getResultadoPdfUrl(path: string, download?: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('resultados-pdfs')
    .createSignedUrl(path, 3600, download ? { download } : undefined)
  if (error) throw error
  return data.signedUrl
}

type NewResultado = Omit<Resultado, 'id' | 'created_at' | 'pdf_url'> & { pdfFile: File }

export function useAddResultado() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (r: NewResultado) => {
      const { pdfFile, ...campos } = r
      const path = `${campos.ips_id}/${campos.appointment_id}.pdf`

      const { error: uploadError } = await supabase.storage
        .from('resultados-pdfs')
        .upload(path, pdfFile, { upsert: true, contentType: 'application/pdf' })

      if (uploadError) throw new Error(`Error al subir el PDF: ${uploadError.message}`)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('resultados') as any).insert({ ...campos, pdf_url: path })
      if (error) throw error

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('appointments') as any).update({ estado: 'atendida' }).eq('id', r.appointment_id)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['resultados'] })
      qc.invalidateQueries({ queryKey: ['appointments'] })
    },
  })
}

export function useResultadoPdfUrl(path: string | undefined) {
  return useQuery({
    queryKey: ['resultado-pdf-url', path],
    queryFn: async () => {
      if (!path) return null
      const { data, error } = await supabase.storage
        .from('resultados-pdfs')
        .createSignedUrl(path, 3600)
      if (error) throw error
      return data.signedUrl
    },
    enabled: !!path,
    staleTime: 50 * 60 * 1000, // refrescar antes de que expire (50 min)
  })
}
