import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SITE_URL = (Deno.env.get('SITE_URL') ?? 'http://localhost:8080').replace(/\/$/, '')

// Origins allowed to receive the recovery link. Never trust the redirect sent by the
// browser: the link carries the session tokens, so an attacker-controlled origin would
// be an account takeover. Supabase enforces its own Redirect URLs allowlist too.
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_REDIRECT_ORIGINS') ?? SITE_URL)
  .split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean)

function resolveRedirect(requested?: string): string {
  const fallback = `${ALLOWED_ORIGINS[0] ?? SITE_URL}/reset-password`
  if (!requested) return fallback
  try {
    const { origin } = new URL(requested)
    // The path is forced, so an allowed origin cannot be turned into an open redirect
    return ALLOWED_ORIGINS.includes(origin) ? `${origin}/reset-password` : fallback
  } catch {
    return fallback
  }
}

// Best-effort throttle: Edge Function instances are short-lived and not shared, so this
// only stops trivial repeat submissions. Supabase rate limits are the real backstop.
const lastSent = new Map<string, number>()
const COOLDOWN_MS = 60_000

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const { email, redirectTo } = await req.json().catch(() => ({ email: null, redirectTo: null }))

  if (typeof email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
    return json({ error: 'Correo electrónico inválido' }, 400)
  }

  const normalizedEmail = email.trim().toLowerCase()

  // Always answer the same way, whether or not the account exists, so this endpoint
  // cannot be used to find out which emails are registered.
  const genericOk = json({ ok: true })

  const previous = lastSent.get(normalizedEmail)
  if (previous && Date.now() - previous < COOLDOWN_MS) {
    console.log('[reset-password] skipped, still in cooldown')
    return genericOk
  }
  lastSent.set(normalizedEmail, Date.now())

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'recovery',
    email: normalizedEmail,
    options: { redirectTo: resolveRedirect(redirectTo) },
  })

  if (error || !data?.properties?.action_link) {
    // Unknown address, or the link could not be generated. Nothing is sent and the
    // caller still gets the generic response.
    console.log('[reset-password] no link generated:', error?.message ?? 'missing action_link')
    return genericOk
  }

  const actionLink = data.properties.action_link

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#0891b2">MedCitas</h2>
      <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta.</p>
      <p>Haz clic en el botón para crear una contraseña nueva. El enlace vence en 1 hora y solo puede usarse una vez.</p>
      <a href="${actionLink}" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#0891b2;color:white;border-radius:6px;text-decoration:none">
        Cambiar mi contraseña
      </a>
      <p style="margin-top:24px;font-size:12px;color:#64748b">
        Si no solicitaste este cambio, puedes ignorar este correo: tu contraseña seguirá siendo la misma.
      </p>
    </div>
  `

  const testEmail = Deno.env.get('RESEND_TEST_EMAIL')
  // In test mode all emails go to RESEND_TEST_EMAIL; in production to the real address
  const to = testEmail ?? normalizedEmail
  console.log('[reset-password] sending to:', to, testEmail ? '(test mode)' : '')

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'MedCitas <onboarding@resend.dev>',
      to,
      subject: 'Restablece tu contraseña — MedCitas',
      html,
    }),
  })
  const resBody = await res.json()
  console.log('[reset-password] Resend response:', res.status, JSON.stringify(resBody))

  return genericOk
})
