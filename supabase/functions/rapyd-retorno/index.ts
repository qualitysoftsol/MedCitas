// Página de retorno de Rapyd. Rapyd no acepta URLs de localhost como destino
// después del pago, así que vuelve aquí (una URL pública de Supabase) y esta
// función redirige a la app: APP_URL/app/particular/pago?pago=<id>.
// El destino siempre es APP_URL; solo se reenvían parámetros validados.
//
// Se despliega sin verificación de JWT (es una redirección del navegador):
//   supabase functions deploy rapyd-retorno --no-verify-jwt
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

serve((req) => {
  const entrada = new URL(req.url).searchParams
  const destino = new URL(`${Deno.env.get('APP_URL') ?? 'http://localhost:8080'}/app/particular/pago`)
  const pago = entrada.get('pago') ?? ''
  if (UUID.test(pago)) destino.searchParams.set('pago', pago)
  if (entrada.get('cancelado') === '1') destino.searchParams.set('cancelado', '1')
  return new Response(null, { status: 302, headers: { Location: destino.toString() } })
})
