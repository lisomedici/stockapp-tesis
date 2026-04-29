import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import NuevoDespachoForm from './NuevoDespachoForm'

export default async function NuevoDespachoPage() {
  const supabase = await createClient()

  const [{ data: tintorerias }, { data: articulos }] = await Promise.all([
    supabase
      .from('tintorerias')
      .select('id, nombre')
      .eq('activo', true)
      .order('nombre'),
    supabase
      .from('articulos')
      .select('id, nombre')
      .eq('activo', true)
      .order('nombre'),
  ])

  // Si faltan catálogos, no se puede crear despacho
  const sinCatalogos =
    !tintorerias?.length || !articulos?.length

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <Link
          href="/admin/despachos"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← Volver a despachos
        </Link>
        <h1 className="text-2xl font-bold mt-1">Nuevo despacho</h1>
        <p className="text-sm text-muted-foreground">
          Carga manual de la planilla de tintorería
        </p>
      </div>

      {sinCatalogos ? (
        <div className="rounded-lg border bg-warning/10 border-warning/30 p-5">
          <p className="text-sm font-medium text-foreground">
            Antes de crear un despacho necesitás tener al menos un artículo y
            una tintorería cargados.
          </p>
          <div className="flex gap-3 mt-3 text-sm">
            {!articulos?.length && (
              <Link
                href="/admin/articulos"
                className="underline hover:no-underline"
              >
                Crear artículo
              </Link>
            )}
            {!tintorerias?.length && (
              <Link
                href="/admin/tintorerias"
                className="underline hover:no-underline"
              >
                Crear tintorería
              </Link>
            )}
          </div>
        </div>
      ) : (
        <NuevoDespachoForm
          tintorerias={tintorerias!}
          articulos={articulos!}
        />
      )}
    </div>
  )
}
