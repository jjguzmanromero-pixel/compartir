import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '../../../lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST(request) {
  // Verificar que quien llama es admin
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const { email, role } = await request.json()

  if (!email || !role) {
    return NextResponse.json({ error: 'Email y rol son requeridos' }, { status: 400 })
  }

  // Usar el Service Role key para invitar (solo disponible en servidor)
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  // Guardar el rol pendiente ANTES de que el usuario acepte
  // Lo guardamos en una tabla de invitaciones
  const { error: inviteError } = await supabaseAdmin
    .from('invitations')
    .insert({ email, role, invited_by: user.id })

  if (inviteError && !inviteError.message.includes('duplicate')) {
    // Si ya existe una invitación para ese email, la actualizamos
    await supabaseAdmin
      .from('invitations')
      .update({ role, invited_by: user.id })
      .eq('email', email)
  }

  // Enviar invitación por correo via Supabase Auth
  const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
    data: { role } // metadata que se guarda en el usuario
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
