import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function AdminDashboard() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('nombre')
    .eq('id', user!.id)
    .single()

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Panel de Administración</h1>
        <p className="text-muted-foreground mt-1">
          Bienvenida, {profile?.nombre ?? 'usuaria'}
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Operación
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card
            href="/admin/despachos"
            title="Ingresos"
            description="Registrar despachos de tintorerías"
          />
          <Card
            disabled
            title="Stock"
            description="Ver rollos disponibles (Etapa 5)"
          />
          <Card
            href="/ventas/dashboard"
            title="Pedidos"
            description="Gestión de pedidos de clientes"
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Catálogos
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card
            href="/admin/articulos"
            title="Artículos"
            description="Tipos de tela"
          />
          <Card
            href="/admin/tintorerias"
            title="Tintorerías"
            description="Proveedores de teñido"
          />
        </div>
      </section>
    </div>
  )
}

function Card({
  href,
  title,
  description,
  disabled,
}: {
  href?: string
  title: string
  description: string
  disabled?: boolean
}) {
  const content = (
    <div
      className={`rounded-lg border bg-white p-5 shadow-sm transition-all ${
        disabled
          ? 'opacity-50 cursor-not-allowed'
          : 'hover:shadow-md hover:border-primary/30 cursor-pointer'
      }`}
    >
      <h3 className="font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1">{description}</p>
    </div>
  )

  if (disabled || !href) return content
  return <Link href={href}>{content}</Link>
}
