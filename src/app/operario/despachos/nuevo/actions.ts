'use server'

import { createClient } from '@/lib/supabase/server'

export type RolloInput = {
  numero_pieza: string
  color: string
  kilos: string
  metros: string
  ratio_rendimiento: string
  ubicacion: string
  estado: 'en_stock' | 'pendiente'
}

export type DespachoInput = {
  tintoreria_id: string
  articulo_id: string
  fecha_despacho: string
  numero_remito: string
  total_rollos_declarado: string
  total_kilos_declarado: string
  rollos: RolloInput[]
}

export async function createDespacho(input: DespachoInput) {
  const supabase = await createClient()

  if (!input.tintoreria_id) return { error: 'Falta seleccionar la tintorería.' }
  if (!input.articulo_id) return { error: 'Falta seleccionar el artículo.' }
  if (!input.fecha_despacho) return { error: 'Falta la fecha del despacho.' }
  if (!input.rollos.length) return { error: 'Cargá al menos un rollo.' }

  for (const r of input.rollos) {
    if (!r.numero_pieza.trim()) {
      return { error: 'Todos los rollos deben tener número de pieza.' }
    }
    if (r.estado === 'en_stock' && !r.ubicacion.trim()) {
      return {
        error:
          'Los rollos en estado "en stock" deben tener ubicación asignada.',
      }
    }
  }

  const numeros = input.rollos.map((r) => r.numero_pieza.trim())
  const unicos = new Set(numeros)
  if (unicos.size !== numeros.length) {
    return { error: 'Hay números de pieza duplicados en el despacho.' }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Sesión expirada — volvé a iniciar sesión.' }

  // Estado del despacho derivado de los rollos:
  // - todos en_stock → confirmado
  // - alguno pendiente → borrador (esperando confirmación física)
  const algunoPendiente = input.rollos.some((r) => r.estado === 'pendiente')
  const despachoEstado = algunoPendiente ? 'borrador' : 'confirmado'

  const { data: despacho, error: dError } = await supabase
    .from('despachos')
    .insert({
      tintoreria_id: input.tintoreria_id,
      articulo_id: input.articulo_id,
      fecha_despacho: input.fecha_despacho,
      numero_remito: input.numero_remito.trim() || null,
      total_rollos_declarado: input.total_rollos_declarado
        ? parseInt(input.total_rollos_declarado)
        : null,
      total_kilos_declarado: input.total_kilos_declarado
        ? parseFloat(input.total_kilos_declarado)
        : null,
      estado: despachoEstado,
      origen: 'manual',
      created_by: user.id,
    })
    .select()
    .single()

  if (dError || !despacho) {
    return { error: `No se pudo crear el despacho: ${dError?.message}` }
  }

  const rollosToInsert = input.rollos.map((r) => ({
    despacho_id: despacho.id,
    articulo_id: input.articulo_id,
    numero_pieza: r.numero_pieza.trim(),
    color: r.color.trim() || null,
    kilos: r.kilos ? parseFloat(r.kilos) : null,
    metros: r.metros ? parseFloat(r.metros) : null,
    ratio_rendimiento: r.ratio_rendimiento
      ? parseFloat(r.ratio_rendimiento)
      : null,
    ubicacion: r.ubicacion.trim() || null,
    estado: r.estado,
  }))

  const { error: rError } = await supabase.from('rollos').insert(rollosToInsert)

  if (rError) {
    await supabase.from('despachos').delete().eq('id', despacho.id)
    return { error: `No se pudieron cargar los rollos: ${rError.message}` }
  }

  return { success: true, despachoId: despacho.id }
}

// ── Creación inline desde el form ───────────────────────────

export async function createTintoreriaInline(nombre: string) {
  const supabase = await createClient()
  const cleanName = nombre.trim()
  if (!cleanName) return { error: 'El nombre no puede estar vacío.' }

  const { data, error } = await supabase
    .from('tintorerias')
    .insert({ nombre: cleanName })
    .select('id, nombre')
    .single()

  if (error || !data) return { error: error?.message ?? 'Error al crear.' }
  return { success: true, data }
}

export async function createArticuloInline(nombre: string) {
  const supabase = await createClient()
  const cleanName = nombre.trim()
  if (!cleanName) return { error: 'El nombre no puede estar vacío.' }

  const { data, error } = await supabase
    .from('articulos')
    .insert({ nombre: cleanName })
    .select('id, nombre')
    .single()

  if (error || !data) return { error: error?.message ?? 'Error al crear.' }
  return { success: true, data }
}
