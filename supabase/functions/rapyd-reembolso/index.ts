// El administrador aprueba o niega un reembolso solicitado.
// POST { reembolso_id, accion: 'aprobar' | 'denegar', nota? }
// Al aprobar se pide a Rapyd el reembolso total; el resultado final llega por
// webhook (REFUND_COMPLETED / REFUND_FAILED / REFUND_REJECTED).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { rapyd, RapydError } from "../_shared/rapyd.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const responder = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return responder(401, { error: 'Unauthorized' })
  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (perfil?.role !== 'admin') return responder(403, { error: 'Forbidden' })

  const { reembolso_id, accion, nota } = await req.json().catch(() => ({}))
  const { data: reembolso } = await supabase
    .from('reembolsos')
    .select('id, estado, motivo, pago:pagos(rapyd_payment_id)')
    .eq('id', reembolso_id)
    .maybeSingle()
  if (!reembolso) return responder(404, { error: 'No existe el reembolso.' })

  const ahora = new Date().toISOString()

  if (accion === 'denegar') {
    if (reembolso.estado !== 'solicitado') return responder(409, { error: 'Este reembolso ya fue procesado.' })
    await supabase.from('reembolsos')
      .update({ estado: 'denegado', detalle: nota || null, resuelto_por: user.id, updated_at: ahora })
      .eq('id', reembolso.id)
    return responder(200, { estado: 'denegado' })
  }

  if (accion !== 'aprobar') return responder(400, { error: 'Acción no válida.' })
  // "fallido" se puede reintentar.
  if (!['solicitado', 'fallido'].includes(reembolso.estado)) return responder(409, { error: 'Este reembolso ya fue procesado.' })
  const pago = Array.isArray(reembolso.pago) ? reembolso.pago[0] : reembolso.pago
  const paymentId = pago?.rapyd_payment_id
  if (!paymentId) return responder(409, { error: 'El pago no tiene referencia de Rapyd.' })

  try {
    // Sin `amount`: Rapyd devuelve el valor total del pago.
    const refund = await rapyd<{ id: string; status: string; failure_message?: string }>('post', '/v1/refunds', {
      payment: paymentId,
      merchant_reference_id: reembolso.id,
      metadata: { reembolso_id: reembolso.id },
    })
    const estado = refund.status === 'Completed' ? 'completado' : refund.status === 'Pending' ? 'en_proceso' : 'fallido'
    await supabase.from('reembolsos').update({
      estado,
      rapyd_refund_id: refund.id,
      detalle: estado === 'fallido' ? refund.failure_message || `Rapyd respondió ${refund.status}` : nota || null,
      resuelto_por: user.id,
      updated_at: ahora,
    }).eq('id', reembolso.id)
    return responder(200, { estado })
  } catch (err) {
    const mensaje = err instanceof RapydError ? err.message : 'No pudimos conectar con Rapyd.'
    await supabase.from('reembolsos')
      .update({ estado: 'fallido', detalle: mensaje, resuelto_por: user.id, updated_at: ahora })
      .eq('id', reembolso.id)
    console.error('[rapyd-reembolso]', err)
    return responder(502, { error: mensaje })
  }
})
