// Cliente mínimo de la API de Rapyd: firma de solicitudes y de webhooks.
// https://docs.rapyd.net/en/request-signatures.html
// https://docs.rapyd.net/en/webhook-authentication.html
//
// Secretos (Supabase → Edge Functions → Secrets):
//   RAPYD_ACCESS_KEY, RAPYD_SECRET_KEY · llaves del Client Portal de Rapyd
//   RAPYD_BASE_URL    · https://sandboxapi.rapyd.net (pruebas) o https://api.rapyd.net
//   RAPYD_WEBHOOK_URL · URL exacta del webhook configurada en el Client Portal

const enc = new TextEncoder()

function credenciales() {
  const accessKey = Deno.env.get('RAPYD_ACCESS_KEY')
  const secretKey = Deno.env.get('RAPYD_SECRET_KEY')
  if (!accessKey || !secretKey) throw new Error('Faltan los secretos RAPYD_ACCESS_KEY o RAPYD_SECRET_KEY')
  return { accessKey, secretKey }
}

/** Rapyd firma con HMAC-SHA256, pasa el resultado a hexadecimal y ese texto a base64. */
async function firmar(texto: string, secretKey: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secretKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(texto)))
  const hex = Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('')
  return btoa(hex)
}

function salt(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return Array.from(bytes, (b) => (b % 36).toString(36)).join('')
}

/** Comparación en tiempo constante, para no filtrar la firma esperada. */
function iguales(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export class RapydError extends Error {
  constructor(message: string, public code?: string) {
    super(message)
    this.name = 'RapydError'
  }
}

/** Llama a la API de Rapyd y devuelve `data`. Lanza RapydError si la respuesta no es SUCCESS. */
export async function rapyd<T>(method: 'get' | 'post', path: string, body?: unknown): Promise<T> {
  const { accessKey, secretKey } = credenciales()
  const baseUrl = Deno.env.get('RAPYD_BASE_URL') ?? 'https://sandboxapi.rapyd.net'
  const s = salt()
  const timestamp = Math.floor(Date.now() / 1000).toString()
  // JSON.stringify no agrega espacios: es exactamente el texto que se firma y se envía.
  const bodyStr = body === undefined ? '' : JSON.stringify(body)
  const signature = await firmar(method + path + s + timestamp + accessKey + secretKey + bodyStr, secretKey)

  const res = await fetch(baseUrl + path, {
    method: method.toUpperCase(),
    headers: { 'Content-Type': 'application/json', access_key: accessKey, salt: s, timestamp, signature },
    body: bodyStr || undefined,
  })
  const json = await res.json().catch(() => null)
  if (!res.ok || json?.status?.status !== 'SUCCESS') {
    const st = json?.status
    console.error('[rapyd]', method.toUpperCase(), path, res.status, st?.error_code, st?.message)
    throw new RapydError(st?.message || `Rapyd respondió ${res.status}`, st?.error_code)
  }
  return json.data as T
}

/** Verifica la firma de un webhook de Rapyd sobre el cuerpo tal como llegó. */
export async function webhookValido(headers: Headers, rawBody: string): Promise<boolean> {
  const { accessKey, secretKey } = credenciales()
  const url = Deno.env.get('RAPYD_WEBHOOK_URL')
  const s = headers.get('salt')
  const timestamp = headers.get('timestamp')
  const signature = headers.get('signature')
  if (!url || !s || !timestamp || !signature) return false
  const esperada = await firmar(url + s + timestamp + accessKey + secretKey + rawBody, secretKey)
  return iguales(esperada, signature)
}
