import { createClient } from '@/lib/supabase/server'
import BackButton from '@/components/BackButton'

export default async function TintoreriasPage() {
  const supabase = await createClient()

  const { data: tintorerias } = await supabase
    .from('tintorerias')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <BackButton href="/admin/dashboard" />
        <h1 className="text-2xl font-bold mt-1">Tintorerías</h1>
        <p className="text-sm text-muted-foreground">
          Proveedores que tiñen las telas
        </p>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <p className="font-medium">¿Necesitás agregar una tintorería nueva?</p>
        <p className="mt-0.5">
          Las tintorerías se configuran manualmente por el equipo de StockApp
          para garantizar que la extracción por IA funcione correctamente con
          cada proveedor. Contactá a Trinidad para solicitar el alta.
        </p>
      </div>

      <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 border-b">
            <tr className="text-left">
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {tintorerias && tintorerias.length > 0 ? (
              tintorerias.map((t) => (
                <tr key={t.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium">{t.nombre}</td>
                  <td className="px-4 py-3">
                    {t.activo ? (
                      <span className="text-xs text-success">Activa</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Inactiva
                      </span>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={2}
                  className="px-4 py-8 text-center text-sm text-muted-foreground"
                >
                  Todavía no cargaste ninguna tintorería.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
