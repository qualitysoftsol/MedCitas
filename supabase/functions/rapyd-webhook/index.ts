// Recibe los webhooks de Rapyd. Es la única fuente de verdad del pago: la
// página a la que vuelve el usuario solo muestra el estado.
//
// Se despliega SIN verificación de JWT (quien llama es Rapyd):
//   supabase functions deploy rapyd-webhook --no-verify-jwt
// y su URL se configura en Rapyd → Client Portal → Developers → Webhooks,
// la misma que el secreto RAPYD_WEBHOOK_URL.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { webhookValido } from "../_shared/rapyd.ts"

const EVENTOS_PAGO = ['PAYMENT_COMPLETED', 'PAYMENT_FAILED', 'PAYMENT_EXPIRED']
const EVENTOS_REEMBOLSO = ['REFUND_COMPLETED', 'REFUND_FAILED', 'REFUND_REJECTED']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Método no permitido', { status: 405 })

  const raw = await req.text()
  if (!(await webhookValido(req.headers, raw))) {
    console.warn('[rapyd-webhook] firma inválida')
    return new Response('Firma inválida', { status: 401 })
  }

  const evento = JSON.parse(raw)
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // Idempotencia: Rapyd reintenta los webhooks; uno ya procesado se ignora.
  const { error: dup } = await supabase.from('pagos_eventos').insert({ id: evento.id, tipo: evento.type, payload: evento })
  if (dup) {
    if (dup.code === '23505') return new Response('ok')
    console.error('[rapyd-webhook] guardar evento', dup)
    return new Response('Error', { status: 500 })
  }

  try {
    const d = evento.data ?? {}
    let resultado = 'ignorado'

    if (EVENTOS_PAGO.includes(evento.type)) {
      const pagoId = d.metadata?.pago_id ?? d.merchant_reference_id
      if (UUID.test(pagoId ?? '')) {
        const { data, error } = await supabase.rpc('registrar_pago_rapyd', {
          p_pago_id: pagoId,
          p_evento: evento.type,
          p_payment_id: d.id ?? null,
          p_metodo: d.payment_method_type ?? null,
          p_monto: d.amount ?? null,
          p_moneda: d.currency_code ?? null,
          p_detalle: d.failure_message ?? null,
        })
        if (error) throw error
        resultado = data
      }
    } else if (EVENTOS_REEMBOLSO.includes(evento.type)) {
      const reembolsoId = d.metadata?.reembolso_id ?? d.merchant_reference_id
      const completado = evento.type === 'REFUND_COMPLETED'
      const cambios = {
        estado: completado ? 'completado' : 'fallido',
        rapyd_refund_id: d.id ?? null,
        detalle: completado ? null : d.failure_message || 'Rapyd no pudo completar el reembolso.',
        updated_at: new Date().toISOString(),
      }
      const query = supabase.from('reembolsos').update(cambios)
      const { error } = UUID.test(reembolsoId ?? '') ? await query.eq('id', reembolsoId) : await query.eq('rapyd_refund_id', d.id)
      if (error) throw error
      resultado = cambios.estado
    }

    await supabase.from('pagos_eventos').update({ resultado }).eq('id', evento.id)
    console.log('[rapyd-webhook]', evento.type, evento.id, '→', resultado)
    return new Response('ok')
  } catch (err) {
    // Se borra el registro para que el reintento de Rapyd se procese de nuevo.
    console.error('[rapyd-webhook]', evento.type, evento.id, err)
    await supabase.from('pagos_eventos').delete().eq('id', evento.id)
    return new Response('Error', { status: 500 })
  }
})
