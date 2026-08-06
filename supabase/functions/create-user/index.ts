import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Verify caller is admin
  const authHeader = req.headers.get('Authorization')!
  const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
  if (authError || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })

  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders })

  const body = await req.json()
  const { email, password, role, nombre, telefono, nit, cedula, departamento, ciudad, lat, lng, departamentos_medicos, clasificaciones } = body

  if (!email || !password || !role || !nombre) {
    return new Response(JSON.stringify({ error: 'Campos requeridos: email, password, role, nombre' }), { status: 400, headers: corsHeaders })
  }

  const ALLOWED_ROLES = ['ips', 'empresa', 'particular']
  if (!ALLOWED_ROLES.includes(role)) {
    return new Response(JSON.stringify({ error: 'Rol inválido' }), { status: 400, headers: corsHeaders })
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role, nombre, telefono, nit, cedula, departamento, ciudad, lat, lng, departamentos_medicos, clasificaciones },
  })

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders })

  return new Response(JSON.stringify({ user: data.user }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
