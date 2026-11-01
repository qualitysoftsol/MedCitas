// Crea la reserva de un particular (cita "pendiente_pago" que aparta el horario
// 30 minutos) y la página de pago de Rapyd. También sirve para reintentar el
// pago de una reserva vigente.
//
// POST { slot_id, empleado_cedula, tipo_examen }  → reserva nueva
// POST { appointment_id }                         → reintento
// Responde { pago_id, redirect_url }.
//
// Secretos: los de _shared/rapyd.ts, APP_URL (la usa rapyd-retorno) y,
// opcional, RAPYD_PAYMENT_METHODS: lista separada por comas de los medios de
// pago a mostrar (ver supabase/scripts/rapyd-metodos.mjs).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { rapyd, RapydError } from "../_shared/rapyd.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const MINUTOS_RESERVA = 30

const responder = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

interface Pago { id: string; appointment_id: string; monto: number; expira_at: string }

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return responder(401, { error: 'Inicia sesión para continuar.' })

  const { data: perfil } = await supabase.from('profiles').select('role, nombre').eq('id', user.id).single()
  if (perfil?.role !== 'particular') return responder(403, { error: 'Solo los particulares pagan en línea.' })

  // Libera primero las reservas vencidas, por si pg_cron aún no pasó.
  await supabase.rpc('expirar_pagos_pendientes')

  const body = await req.json().catch(() => ({}))
  let pago: Pago
  let citaNueva: string | null = null

  if (body.appointment_id) {
    const { data } = await supabase
      .from('pagos')
      .select('id, appointment_id, monto, expira_at, cita:appointments(estado)')
      .eq('appointment_id', body.appointment_id)
      .eq('solicitante_id', user.id)
      .maybeSingle()
    // Relación muchos-a-uno: PostgREST devuelve un objeto (los tipos sin generar dicen arreglo).
    const cita = Array.isArray(data?.cita) ? data.cita[0] : data?.cita
    if (!data || cita?.estado !== 'pendiente_pago') {
      return responder(409, { error: 'Esta reserva ya no está pendiente de pago.', codigo: 'RESERVA_NO_PENDIENTE' })
    }
    pago = data
  } else {
    const { slot_id, empleado_cedula, tipo_examen } = body
    if (!slot_id || !/^\d{5,12}$/.test(String(empleado_cedula ?? '')) || !tipo_examen) {
      return responder(400, { error: 'Faltan datos de la cita.' })
    }
    const { data: tipo } = await supabase.from('tipos_examen').select('roles_permitidos').eq('nombre', tipo_examen).maybeSingle()
    if (!tipo?.roles_permitidos?.includes('particular')) return responder(400, { error: 'Tipo de examen no válido.' })

    const { data: slot } = await supabase.from('slots').select('*').eq('id', slot_id).maybeSingle()
    if (!slot || slot.taken) return responder(409, { error: 'Ese horario ya no está disponible.', codigo: 'HORARIO_TOMADO' })

    // Los datos de la cita salen del horario, no de lo que envía el navegador.
    const { data: cita, error } = await supabase
      .from('appointments')
      .insert({
        slot_id: slot.id, ips_id: slot.ips_id, solicitante_id: user.id,
        empleado_nombre: perfil.nombre, empleado_cedula: String(empleado_cedula), tipo_examen,
        fecha: slot.fecha, hora: slot.hora, ciudad: slot.ciudad, servicio: slot.servicio,
        estado: 'pendiente_pago',
      })
      .select('id')
      .single()
    if (error) {
      if (error.code === '23505') return responder(409, { error: 'Ese horario ya no está disponible.', codigo: 'HORARIO_TOMADO' })
      if (error.hint === 'SERVICIO_SIN_PRECIO') return responder(409, { error: 'Ese servicio ya no tiene precio en esta IPS.', codigo: 'SERVICIO_SIN_PRECIO' })
      console.error('[rapyd-checkout] insert cita', error)
      return responder(500, { error: 'No pudimos crear la reserva.' })
    }
    citaNueva = cita.id

    const { data: precio } = await supabase.from('citas_precios').select('precio_total').eq('appointment_id', cita.id).single()
    const expira = new Date(Date.now() + MINUTOS_RESERVA * 60_000).toISOString()
    const { data: nuevo, error: errPago } = await supabase
      .from('pagos')
      .insert({ appointment_id: cita.id, solicitante_id: user.id, monto: precio!.precio_total, expira_at: expira })
      .select('id, appointment_id, monto, expira_at')
      .single()
    if (errPago) {
      console.error('[rapyd-checkout] insert pago', errPago)
      await supabase.from('appointments').update({ estado: 'expirada' }).eq('id', cita.id)
      return responder(500, { error: 'No pudimos crear la reserva.' })
    }
    pago = nuevo
  }

  const expiraSeg = Math.floor(new Date(pago.expira_at).getTime() / 1000)
  // Rapyd exige al menos un minuto de vigencia para la página de pago.
  if (expiraSeg - Date.now() / 1000 < 90) {
    return responder(409, { error: 'La reserva está por vencer. Elige el horario de nuevo.', codigo: 'RESERVA_POR_VENCER' })
  }

  // Rapyd no acepta localhost como URL de retorno: vuelve a rapyd-retorno (pública)
  // y esa función redirige a APP_URL/app/particular/pago.
  const volver = `${Deno.env.get('SUPABASE_URL')}/functions/v1/rapyd-retorno?pago=${pago.id}`
  const metodos = (Deno.env.get('RAPYD_PAYMENT_METHODS') ?? '').split(',').map((m) => m.trim()).filter(Boolean)

  try {
    const checkout = await rapyd<{ id: string; redirect_url: string }>('post', '/v1/checkout', {
      amount: pago.monto,
      currency: 'COP',
      country: 'CO',
      merchant_reference_id: pago.id,
      complete_checkout_url: volver,
      complete_payment_url: volver,
      error_payment_url: volver,
      cancel_checkout_url: `${volver}&cancelado=1`,
      page_expiration: expiraSeg,
      metadata: { pago_id: pago.id, appointment_id: pago.appointment_id },
      // Sin efectivo ni transferencias que tardan días: no encajan con 30 minutos de reserva.
      ...(metodos.length > 0
        ? { payment_method_types_include: metodos }
        : { payment_method_type_categories: ['card', 'bank_redirect', 'ewallet'] }),
    })
    await supabase
      .from('pagos')
      .update({ rapyd_checkout_id: checkout.id, estado: 'pendiente', detalle: null, updated_at: new Date().toISOString() })
      .eq('id', pago.id)
    return responder(200, { pago_id: pago.id, redirect_url: checkout.redirect_url })
  } catch (err) {
    // Si la reserva es nueva y la pasarela falló, se libera el horario de inmediato.
    if (citaNueva) {
      await supabase.from('pagos').update({ estado: 'expirado', detalle: String((err as Error).message) }).eq('id', pago.id)
      await supabase.from('appointments').update({ estado: 'expirada' }).eq('id', citaNueva)
    }
    console.error('[rapyd-checkout]', err instanceof RapydError ? `${err.code}: ${err.message}` : err)
    // El código de Rapyd no es sensible y permite diagnosticar desde la pestaña Network.
    return responder(502, {
      error: 'No pudimos conectar con la pasarela de pagos. Inténtalo de nuevo.',
      pasarela: err instanceof RapydError ? { codigo: err.code ?? null, mensaje: err.message } : { mensaje: String((err as Error)?.message ?? err) },
    })
  }
})
