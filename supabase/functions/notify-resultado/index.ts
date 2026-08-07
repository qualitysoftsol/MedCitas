import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req) => {
  const payload = await req.json()
  const record = payload.record
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data: ips } = await supabase.from('profiles').select('nombre').eq('id', record.ips_id).single()
  const { data: { user: solUser } } = await supabase.auth.admin.getUserById(record.solicitante_id)

  const aptoLabel = record.apto === 'apto' ? 'Apto' : record.apto === 'apto_restricciones' ? 'Apto con restricciones' : 'No apto'

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#0891b2">MedCitas — Resultado disponible</h2>
      <p>${ips?.nombre} ha cargado el resultado del examen de <strong>${record.empleado_nombre}</strong>.</p>
      <p>Aptitud: <strong>${aptoLabel}</strong></p>
      <p>Diagnóstico: ${record.diagnostico}</p>
      <a href="${Deno.env.get('SITE_URL') ?? 'https://medcitas.co'}" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#0891b2;color:white;border-radius:6px;text-decoration:none">
        Ver resultado completo
      </a>
    </div>
  `

  if (solUser?.email) {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'MedCitas <notificaciones@tudominio.co>',
        to: solUser.email,
        subject: `Resultado disponible — ${record.empleado_nombre}`,
        html,
      }),
    })
  }

  // Insert in-app notification for solicitante
  await supabase.from('notifications').insert([
    {
      user_id: record.solicitante_id,
      tipo: 'resultado_cargado',
      titulo: `Resultado disponible — ${record.empleado_nombre}`,
      mensaje: `${ips?.nombre} ha cargado el resultado de ${record.empleado_nombre}. Aptitud: ${aptoLabel}.`,
    }
  ])

  return new Response('ok')
})
