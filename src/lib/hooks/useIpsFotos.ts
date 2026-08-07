import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { convertToWebP } from '@/lib/imageUtils'
import type { IpsFoto } from '@/lib/database.types'

export function useIpsFotos(ipsId: string | undefined) {
  return useQuery({
    queryKey: ['ips-fotos', ipsId],
    queryFn: async () => {
      if (!ipsId) return []
      const { data, error } = await supabase
        .from('ips_fotos')
        .select('*')
        .eq('ips_id', ipsId)
        .order('orden')
      if (error) throw error
      return data as IpsFoto[]
    },
    enabled: !!ipsId,
  })
}

export function useUploadFoto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ ipsId, file, orden }: { ipsId: string; file: File; orden: number }) => {
      const webpBlob = await convertToWebP(file)
      const fileName = `${Date.now()}_${file.name.replace(/\.[^.]+$/, '')}.webp`
      const path = `${ipsId}/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('ips-fotos')
        .upload(path, webpBlob, { contentType: 'image/webp', upsert: false })
      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage.from('ips-fotos').getPublicUrl(path)

      const { error: dbError } = await (supabase.from('ips_fotos') as any).insert({ ips_id: ipsId, url: publicUrl, orden })
      if (dbError) throw dbError
    },
    onSuccess: (_data, { ipsId }) => {
      qc.invalidateQueries({ queryKey: ['ips-fotos', ipsId] })
    },
  })
}

export function useDeleteFoto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ foto, ipsId }: { foto: IpsFoto; ipsId: string }) => {
      // Extract storage path from public URL
      const urlParts = foto.url.split('/ips-fotos/')
      const storagePath = urlParts[1]

      const { error: storageError } = await supabase.storage
        .from('ips-fotos')
        .remove([storagePath])
      if (storageError) throw storageError

      const { error: dbError } = await supabase
        .from('ips_fotos')
        .delete()
        .eq('id', foto.id)
      if (dbError) throw dbError
    },
    onSuccess: (_data, { ipsId }) => {
      qc.invalidateQueries({ queryKey: ['ips-fotos', ipsId] })
    },
  })
}
