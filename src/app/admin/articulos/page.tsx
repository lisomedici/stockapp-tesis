import { createClient } from '@/lib/supabase/server'
import BackButton from '@/components/BackButton'
import { NuevoArticuloForm, EditArticuloRow } from './ArticuloForm'

export default async function ArticulosPage() {
  const supabase = await createClient()

  const { data: articulos } = await supabase
    .from('articulos')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <BackButton href="/admin/dashboard" />
          <h1 className="text-2xl font-bold mt-1">Artículos</h1>
          <p className="text-sm text-muted-foreground">
            Tipos de tela disponibles
          </p>
        </div>
      </div>

      <NuevoArticuloForm />

      <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 border-b">
            <tr className="text-left">
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Descripción</th>
              <th className="px-4 py-3 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {articulos && articulos.length > 0 ? (
              articulos.map((a) => (
                <EditArticuloRow key={a.id} articulo={a} />
              ))
            ) : (
              <tr>
                <td
                  colSpan={3}
                  className="px-4 py-8 text-center text-sm text-muted-foreground"
                >
                  Todavía no cargaste ningún artículo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
