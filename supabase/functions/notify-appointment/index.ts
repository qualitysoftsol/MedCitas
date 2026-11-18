import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { formatDuracion } from "../_shared/formato.ts"

serve(async (req) => {
  const payload = await req.json()
  const record = payload.record
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const [{ data: ips }, { data: solicitante }] = await Promise.all([
    supabase.from('profiles').select('nombre, direccion').eq('id', record.ips_id).single(),
    supabase.from('profiles').select('nombre, role').eq('id', record.solicitante_id).single(),
  ])

  // Para la IPS: quién solicitó la cita (la empresa, o el paciente como particular).
  const origen = solicitante?.role === 'empresa'
    ? `Solicitada por la empresa ${solicitante.nombre}.`
    : solicitante?.role === 'particular'
      ? 'Solicitada por el paciente (particular).'
      : ''

  const { data: { user: ipsUser } } = await supabase.auth.admin.getUserById(record.ips_id)
  const { data: { user: solUser } } = await supabase.auth.admin.getUserById(record.solicitante_id)

  // Datos que no vienen en el registro del trigger: el correo del empleado, las
  // pruebas (se insertan después de la cita) y las indicaciones. La función corre
  // después de confirmarse la transacción, así que ya están todas.
  const [{ data: cita }, { data: pruebas }, { data: tipo }] = await Promise.all([
    supabase.from('appointments').select('avisar_empleado, empleado:empleados(correo)').eq('id', record.id).maybeSingle(),
    supabase.from('citas_pruebas').select('servicio, info:servicios(indicaciones, duracion_min)').eq('appointment_id', record.id),
    supabase.from('tipos_evaluacion').select('indicaciones').eq('codigo', record.tipo_evaluacion ?? '').maybeSingle(),
  ])
  // Relación muchos-a-uno: PostgREST devuelve un objeto (los tipos sin generar dicen arreglo).
  const uno = <T,>(v: T | T[] | null | undefined) => (Array.isArray(v) ? v[0] : v) ?? null
  const correoEmpleado = cita?.avisar_empleado ? uno(cita.empleado)?.correo ?? null : null
  const duracion = (pruebas ?? []).reduce((t, p) => t + (uno(p.info)?.duracion_min ?? 0), 0)
  const indicaciones = [
    ...(pruebas ?? []).map((p) => uno(p.info)?.indicaciones).filter((i): i is string => !!i?.trim()),
    ...(tipo?.indicaciones?.trim() ? [tipo.indicaciones] : []),
  ]

  const isCancel = record.estado === 'cancelada'
  const subject = isCancel
    ? `Cita cancelada — ${record.fecha} ${record.hora}`
    : `Cita confirmada — ${record.empleado_nombre}, ${record.fecha}`

  const body = isCancel
    ? `La cita de ${record.empleado_nombre} (documento ${record.empleado_cedula}) el ${record.fecha} a las ${record.hora} ha sido cancelada.`
    : `Se ha confirmado la cita de ${record.empleado_nombre} (documento ${record.empleado_cedula}) en ${ips?.nombre} el ${record.fecha} a las ${record.hora}. Evaluación: ${record.tipo_examen}. Pruebas: ${record.servicio}.`

  // La IPS recibe además quién solicitó la cita; el solicitante recibe el mensaje de siempre.
  const ipsBody = origen ? `${body} ${origen}` : body

  const escapar = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  // Duración e indicaciones: para el paciente (particular o empleado), no para la IPS.
  const preparacion = isCancel ? '' : `
      ${duracion > 0 ? `<p>Duración aproximada de la visita: ${formatDuracion(duracion)}.</p>` : ''}
      ${indicaciones.length ? `<p><strong>Antes de tu cita</strong></p><ul>${indicaciones.map((i) => `<li>${escapar(i)}</li>`).join('')}</ul>` : ''}`

  const renderHtml = (texto: string, extra = '') => `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#0891b2">MedCitas</h2>
      <p>${escapar(texto)}</p>
      ${extra}
      <a href="${Deno.env.get('SITE_URL') ?? 'https://medcitas.co'}" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#0891b2;color:white;border-radius:6px;text-decoration:none">
        Ver en plataforma
      </a>
    </div>
  `

  const empleadoBody = isCancel
    ? `Tu cita del ${record.fecha} a las ${record.hora} en ${ips?.nombre} fue cancelada.`
    : `Tienes una cita de evaluación médica ocupacional (${record.tipo_examen}) el ${record.fecha} a las ${record.hora} en ${ips?.nombre}${ips?.direccion ? `, ${ips.direccion}` : ''}. Pruebas: ${record.servicio}. Lleva tu documento de identidad.`

  const testEmail = Deno.env.get('RESEND_TEST_EMAIL')
  const realEmails = [
    { to: ipsUser?.email, html: renderHtml(ipsBody) },
    { to: solUser?.email, html: renderHtml(body, solicitante?.role === 'particular' ? preparacion : '') },
    { to: correoEmpleado, html: renderHtml(empleadoBody, preparacion) },
  ].filter((e): e is { to: string; html: string } => !!e.to)
  // In test mode every email (one per party) goes to RESEND_TEST_EMAIL; in production to real recipients
  const emails = testEmail ? realEmails.map((e) => ({ ...e, to: testEmail })) : realEmails
  console.log('[notify-appointment] sending to:', emails.map((e) => e.to), testEmail ? '(test mode)' : '')

  await Promise.all(emails.map(async ({ to, html }) => {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'MedCitas <onboarding@resend.dev>', to, subject, html }),
    })
    const resBody = await res.json()
    console.log('[notify-appointment] Resend response for', to, ':', res.status, JSON.stringify(resBody))
  }))

  // Insert in-app notifications for both parties
  const notifType = isCancel ? 'cita_cancelada' : 'cita_agendada'
  const notifTitulo = isCancel
    ? `Cita cancelada — ${record.fecha} ${record.hora}`
    : `Cita confirmada — ${record.empleado_nombre}`
  await supabase.from('notifications').insert([
    { user_id: record.ips_id, tipo: notifType, titulo: notifTitulo, mensaje: ipsBody },
    { user_id: record.solicitante_id, tipo: notifType, titulo: notifTitulo, mensaje: body },
  ])

  return new Response('ok')
})
