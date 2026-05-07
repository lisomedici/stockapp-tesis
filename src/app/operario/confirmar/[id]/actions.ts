'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type ConfirmarRolloResult =
  | {
      ok: true
      rollo: { id: string; numero_pieza: string }
      ingresoCompleto: boolean
    }
  | {
      ok: false
      error: string
      codigo: 'NO_MATCH' | 'YA_CONFIRMADO' | 'DB_ERROR'
    }

export async function confirmarRollo(
  ingresoId: string,
  numeroPieza: string,
  ubicacion: string
): Promise<ConfirmarRolloResult> {
  const supabase = await createClient()

  const { data: rollo, error: fetchError } = await supabase
    .from('rollos')
    .select('id, numero_pieza, estado')
    .eq('ingreso_id', ingresoId)
    .eq('numero_pieza', numeroPieza.trim())
    .single()

  if (fetchError || !rollo) {
    return {
      ok: false,
      error: 'Este código no pertenece a este ingreso.',
      codigo: 'NO_MATCH',
    }
  }

  if (rollo.estado !== 'pendiente') {
    return {
      ok: false,
      error: `El rollo ${rollo.numero_pieza} ya fue confirmado.`,
      codigo: 'YA_CONFIRMADO',
    }
  }

  const { error: updateError } = await supabase
    .from('rollos')
    .update({ estado: 'en_stock', ubicacion: ubicacion.trim() || null })
    .eq('id', rollo.id)

  if (updateError) {
    return { ok: false, error: updateError.message, codigo: 'DB_ERROR' }
  }

  // Si no quedan rollos pendientes, cerrar el ingreso
  const { count } = await supabase
    .from('rollos')
    .select('id', { count: 'exact', head: true })
    .eq('ingreso_id', ingresoId)
    .eq('estado', 'pendiente')

  const ingresoCompleto = count === 0

  if (ingresoCompleto) {
    await supabase
      .from('ingresos')
      .update({ estado: 'confirmado' })
      .eq('id', ingresoId)
  }

  revalidatePath(`/operario/confirmar/${ingresoId}`)
  revalidatePath('/operario/confirmar')

  return { ok: true, rollo: { id: rollo.id, numero_pieza: rollo.numero_pieza }, ingresoCompleto }
}
