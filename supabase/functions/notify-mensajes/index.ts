import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// La llama pg_cron (disparar_correo_mensajes, migración 024) cada 5 minutos
// cuando hay mensajes sin leer de hace más de 1 hora. Manda un correo por
// conversación al lado que no la ha leído. El correo NO incluye el texto del
// mensaje: puede tener datos de pacientes y el correo sale de la plataforma.
serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Marca los mensajes como avisados en la misma consulta: dos llamadas
  // seguidas no duplican el correo.
  const { data: pendientes, error } = await supabase.rpc('reclamar_mensajes_para_correo')
  if (error) {
    console.error('[notify-mensajes] reclamar_mensajes_para_correo:', error.message)
    return new Response(error.message, { status: 500 })
  }
  const lista = (pendientes ?? []) as { conversacion_id: string; de_admin: boolean; sin_leer: number }[]
  if (lista.length === 0) return new Response('ok')

  const ids = [...new Set(lista.map((p) => p.conversacion_id))]
  const [{ data: convs }, { data: admins }] = await Promise.all([
    supabase.from('conversaciones').select('id, asunto, ips_id, ips:profiles!ips_id(nombre)').in('id', ids),
    supabase.from('profiles').select('id').eq('role', 'admin'),
  ])
  // Relación muchos-a-uno: PostgREST devuelve un objeto (los tipos sin generar dicen arreglo).
  const uno = <T,>(v: T | T[] | null | undefined) => (Array.isArray(v) ? v[0] : v) ?? null
  const conversaciones = new Map((convs ?? []).map((c) => [c.id, c]))

  const correos = new Map<string, string | null>()
  const correoDe = async (userId: string) => {
    if (!correos.has(userId)) {
      const { data } = await supabase.auth.admin.getUserById(userId)
      correos.set(userId, data?.user?.email ?? null)
    }
    return correos.get(userId) ?? null
  }

  const escapar = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const sitio = (Deno.env.get('SITE_URL') ?? 'https://medcitas.co').replace(/\/+$/, '')
  const testEmail = Deno.env.get('RESEND_TEST_EMAIL')

  for (const p of lista) {
    const conv = conversaciones.get(p.conversacion_id)
    if (!conv) continue

    // Escribió el administrador → se avisa a la IPS; escribió la IPS → a los administradores.
    const lado = p.de_admin ? 'ips' : 'admin'
    const destinatarios = p.de_admin ? [conv.ips_id] : (admins ?? []).map((a) => a.id)
    const remitente = p.de_admin ? 'el administrador de MedCitas' : (uno(conv.ips)?.nombre ?? 'una IPS')
    const enlace = `${sitio}/app/${lado}/mensajes?c=${conv.id}`
    const cuantos = p.sin_leer === 1 ? 'un mensaje sin leer' : `${p.sin_leer} mensajes sin leer`

    const subject = `Tienes ${cuantos} — ${conv.asunto}`
    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#0891b2">MedCitas</h2>
        <p>Tienes ${cuantos} de ${escapar(remitente)} en la conversación <strong>«${escapar(conv.asunto)}»</strong>.</p>
        <p>Por seguridad, el contenido solo se ve dentro de la plataforma.</p>
        <a href="${escapar(enlace)}" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#0891b2;color:white;border-radius:6px;text-decoration:none">
          Ver la conversación
        </a>
      </div>
    `

    const reales = (await Promise.all(destinatarios.map(correoDe))).filter((c): c is string => !!c)
    // En modo de prueba todos los correos van a RESEND_TEST_EMAIL, como en notify-appointment.
    const para = testEmail ? reales.map(() => testEmail) : reales
    console.log('[notify-mensajes] conversación', conv.id, '→', para, testEmail ? '(test mode)' : '')

    const enviados = await Promise.all(para.map(async (to) => {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'MedCitas <onboarding@resend.dev>', to, subject, html }),
      })
      console.log('[notify-mensajes] Resend', to, res.status, await res.text())
      return res.ok
    }))

    // Si Resend falló con todos, se deja para la próxima revisión. Sin
    // destinatarios (cuenta sin correo) no se reintenta: no serviría.
    if (para.length > 0 && !enviados.some(Boolean)) {
      await supabase.from('mensajes').update({ correo_enviado_at: null })
        .eq('conversacion_id', conv.id).eq('de_admin', p.de_admin).is('leido_at', null)
    }
  }

  return new Response('ok')
})
