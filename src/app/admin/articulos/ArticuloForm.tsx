'use client'

import { useState } from 'react'
import { createArticulo, updateArticulo } from './actions'

type Articulo = { id: string; nombre: string; descripcion: string | null }

export function NuevoArticuloForm() {
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const result = await createArticulo({ nombre, descripcion })
    if (result.error) {
      setError(result.error)
    } else {
      setNombre('')
      setDescripcion('')
    }
    setLoading(false)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border bg-white p-4 shadow-sm space-y-3"
    >
      <h2 className="font-semibold">Nuevo artículo</h2>

      <div className="grid sm:grid-cols-[1fr_2fr] gap-3">
        <div className="space-y-1">
          <label htmlFor="nombre" className="text-sm font-medium">
            Nombre *
          </label>
          <input
            id="nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
            placeholder="Ej: Lycra ML40"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="descripcion" className="text-sm font-medium">
            Descripción
          </label>
          <input
            id="descripcion"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Opcional"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        {loading ? 'Guardando...' : 'Agregar artículo'}
      </button>
    </form>
  )
}

export function EditArticuloRow({ articulo }: { articulo: Articulo }) {
  const [editing, setEditing] = useState(false)
  const [nombre, setNombre] = useState(articulo.nombre)
  const [descripcion, setDescripcion] = useState(articulo.descripcion ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const result = await updateArticulo(articulo.id, { nombre, descripcion })
    if (result.error) {
      setError(result.error)
    } else {
      setEditing(false)
    }
    setLoading(false)
  }

  if (!editing) {
    return (
      <tr className="border-b last:border-0">
        <td className="px-4 py-3 font-medium">{articulo.nombre}</td>
        <td className="px-4 py-3 text-muted-foreground">
          {articulo.descripcion || '—'}
        </td>
        <td className="px-4 py-3">
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-primary hover:underline"
          >
            Editar
          </button>
        </td>
      </tr>
    )
  }

  return (
    <tr className="border-b last:border-0 bg-zinc-50">
      <td colSpan={3} className="px-4 py-3">
        <form onSubmit={handleSubmit} className="flex flex-wrap gap-2 items-end">
          <div className="space-y-1">
            <label className="text-xs font-medium">Nombre *</label>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
              className="rounded-md border border-input bg-white px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Descripción</label>
            <input
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Opcional"
              className="rounded-md border border-input bg-white px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          {error && <p className="w-full text-xs text-destructive">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Guardando...' : 'Guardar'}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false)
                setNombre(articulo.nombre)
                setDescripcion(articulo.descripcion ?? '')
                setError(null)
              }}
              className="rounded-md border px-3 py-1.5 text-xs hover:bg-zinc-100 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      </td>
    </tr>
  )
}

export default NuevoArticuloForm
