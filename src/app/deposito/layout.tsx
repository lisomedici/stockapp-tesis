import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import LogoutButton from '@/components/LogoutButton'

export default async function DepositoLayout({
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
    .select('role, nombre')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'deposito') redirect('/admin/dashboard')

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50">
      <header className="border-b bg-white px-4 py-3 flex items-center justify-between">
        <span className="font-semibold text-sm">StockApp Muter — Depósito</span>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{profile.nombre}</span>
          <LogoutButton />
        </div>
      </header>
      <main className="flex-1 p-4">{children}</main>
    </div>
  )
}
