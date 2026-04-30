import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import LogoutButton from '@/components/LogoutButton'

export default async function SuperLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('nombre, role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'super') redirect('/')

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50">
      <header className="border-b bg-primary text-primary-foreground px-6 py-3 flex items-center justify-between">
        <span className="font-semibold text-sm">
          StockApp · Super-admin
        </span>
        <div className="flex items-center gap-4">
          <span className="text-sm opacity-90">{profile.nombre}</span>
          <LogoutButton />
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  )
}
