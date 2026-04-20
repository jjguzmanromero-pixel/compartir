import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '../../../lib/supabase-server'
import InvitacionesClient from '../../../components/InvitacionesClient'

export default async function InvitacionesPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/dashboard')

  // Cargar invitaciones enviadas
  const { data: invitations } = await supabase
    .from('invitations')
    .select('*')
    .order('created_at', { ascending: false })

  return <InvitacionesClient user={user} invitations={invitations || []} />
}
