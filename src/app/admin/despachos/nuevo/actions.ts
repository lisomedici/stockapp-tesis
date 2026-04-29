'use server'

import { createClient } from '@/lib/supabase/server'

export type RolloInput = {
  numero_pieza: string
  color: string
  kilos: string
  metros: string
  ratio_rendimiento: string
  ubicacion: string
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

  // Validaciones server-side básicas
  if (!input.tintoreria_id) return { error: 'Falta seleccionar la tintorería.' }
  if (!input.articulo_id) return { error: 'Falta seleccionar el artículo.' }
  if (!input.fecha_despacho) return { error: 'Falta la fecha del despacho.' }
  if (!input.rollos.length) return { error: 'Cargá al menos un rollo.' }

  // Cada rollo debe tener al menos número de pieza
  for (const r of input.rollos) {
    if (!r.numero_pieza.trim()) {
      return { error: 'Todos los rollos deben tener número de pieza.' }
    }
  }

  // Números de pieza únicos dentro del despacho
  const numeros = input.rollos.map((r) => r.numero_pieza.trim())
  const unicos = new Set(numeros)
  if (unicos.size !== numeros.length) {
    return { error: 'Hay números de pieza duplicados en el despacho.' }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Sesión expirada — volvé a iniciar sesión.' }

  // 1. Insert despacho
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
      estado: 'borrador',
      created_by: user.id,
    })
    .select()
    .single()

  if (dError || !despacho) {
    return { error: `No se pudo crear el despacho: ${dError?.message}` }
  }

  // 2. Insert rollos
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
    estado: 'pendiente',
  }))

  const { error: rError } = await supabase.from('rollos').insert(rollosToInsert)

  if (rError) {
    // Cleanup: borrar el despacho huérfano
    await supabase.from('despachos').delete().eq('id', despacho.id)
    return { error: `No se pudieron cargar los rollos: ${rError.message}` }
  }

  return { success: true, despachoId: despacho.id }
}
