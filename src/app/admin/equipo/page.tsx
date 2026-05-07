import { createClient } from '@/lib/supabase/server'
import BackButton from '@/components/BackButton'
import InviteForm from './InviteForm'

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  operario: 'Operario',
  ventas: 'Ventas',
  super: 'Super-admin',
}

export default async function EquipoPage() {
  const supabase = await createClient()

  const { data: usuarios } = await supabase
    .from('profiles')
    .select('id, nombre, role, created_at')
    .order('created_at', { ascending: true })

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <BackButton href="/admin/dashboard" />
        <h1 className="text-2xl font-bold mt-1">Equipo</h1>
        <p className="text-sm text-muted-foreground">
          Usuarios que pueden acceder a tu empresa
        </p>
      </div>

      <InviteForm />

      <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 border-b">
            <tr className="text-left">
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Rol</th>
              <th className="px-4 py-3 font-medium">Alta</th>
            </tr>
          </thead>
          <tbody>
            {usuarios && usuarios.length > 0 ? (
              usuarios.map((u) => (
                <tr key={u.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium">{u.nombre}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs rounded-full px-2 py-0.5 bg-secondary text-secondary-foreground">
                      {ROLE_LABEL[u.role] ?? u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(u.created_at).toLocaleDateString('es-AR')}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={3}
                  className="px-4 py-8 text-center text-sm text-muted-foreground"
                >
                  Sin usuarios todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
