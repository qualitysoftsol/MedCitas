import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req) => {
  const payload = await req.json()
  const record = payload.record
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const [{ data: ips }, { data: solicitante }] = await Promise.all([
    supabase.from('profiles').select('nombre').eq('id', record.ips_id).single(),
    supabase.from('profiles').select('nombre').eq('id', record.solicitante_id).single(),
  ])

  const { data: { user: ipsUser } } = await supabase.auth.admin.getUserById(record.ips_id)
  const { data: { user: solUser } } = await supabase.auth.admin.getUserById(record.solicitante_id)

  const isCancel = record.estado === 'cancelada'
  const subject = isCancel
    ? `Cita cancelada — ${record.fecha} ${record.hora}`
    : `Cita confirmada — ${record.empleado_nombre}, ${record.fecha}`

  const body = isCancel
    ? `La cita de ${record.empleado_nombre} (CC ${record.empleado_cedula}) el ${record.fecha} a las ${record.hora} ha sido cancelada.`
    : `Se ha confirmado la cita de ${record.empleado_nombre} (CC ${record.empleado_cedula}) en ${ips?.nombre} el ${record.fecha} a las ${record.hora}. Examen: ${record.tipo_examen}.`

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#0891b2">MedCitas</h2>
      <p>${body}</p>
      <a href="${Deno.env.get('SITE_URL') ?? 'https://medcitas.co'}" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#0891b2;color:white;border-radius:6px;text-decoration:none">
        Ver en plataforma
      </a>
    </div>
  `

  const recipients = [ipsUser?.email, solUser?.email].filter(Boolean) as string[]
  await Promise.all(recipients.map((to) =>
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'MedCitas <notificaciones@tudominio.co>', to, subject, html }),
    })
  ))

  // Insert in-app notifications for both parties
  const notifType = isCancel ? 'cita_cancelada' : 'cita_agendada'
  const notifTitulo = isCancel
    ? `Cita cancelada — ${record.fecha} ${record.hora}`
    : `Cita confirmada — ${record.empleado_nombre}`
  const notifMensaje = body

  await supabase.from('notifications').insert([
    { user_id: record.ips_id, tipo: notifType, titulo: notifTitulo, mensaje: notifMensaje },
    { user_id: record.solicitante_id, tipo: notifType, titulo: notifTitulo, mensaje: notifMensaje },
  ])

  return new Response('ok')
})
