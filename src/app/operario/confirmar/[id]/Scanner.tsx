'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { NotFoundException } from '@zxing/library'
import { confirmarRollo } from './actions'

type Rollo = { id: string; numero_pieza: string; estado: string }

type Props = {
  ingresoId: string
  rollos: Rollo[]
  totalDeclarado: number | null
}

type Mensaje = {
  texto: string
  tipo: 'error' | 'success' | 'warning'
}

export default function Scanner({ ingresoId, rollos, totalDeclarado }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const readerRef = useRef<BrowserMultiFormatReader | null>(null)
  const controlsRef = useRef<{ stop: () => void } | null>(null)
  const procesandoRef = useRef(false)

  const [permiso, setPermiso] = useState<'solicitando' | 'concedido' | 'denegado'>('solicitando')
  const [rollosLocales, setRollosLocales] = useState<Rollo[]>(rollos)
  const [pendingCode, setPendingCode] = useState<string | null>(null)
  const [ubicacion, setUbicacion] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const [mensaje, setMensaje] = useState<Mensaje | null>(null)
  const [modoManual, setModoManual] = useState(false)
  const [codigoManual, setCodigoManual] = useState('')
  const [mostrarPendientes, setMostrarPendientes] = useState(false)

  const pendientes = rollosLocales.filter((r) => r.estado === 'pendiente')
  const confirmados = rollosLocales.filter((r) => r.estado !== 'pendiente').length
  const total = rollosLocales.length
  const progresoPct = total > 0 ? Math.round((confirmados / total) * 100) : 0

  const mostrarMensaje = useCallback((texto: string, tipo: Mensaje['tipo']) => {
    setMensaje({ texto, tipo })
    setTimeout(() => setMensaje(null), 4000)
  }, [])

  const iniciarScanner = useCallback(async () => {
    if (!videoRef.current) return
    try {
      const reader = new BrowserMultiFormatReader()
      readerRef.current = reader
      const controls = await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current,
        (result, error) => {
          if (result && !procesandoRef.current && !pendingCode) {
            procesandoRef.current = true
            setPendingCode(result.getText())
          }
          // NotFoundException es el "no code found in frame" normal, se ignora
          if (error && !(error instanceof NotFoundException)) {
            console.warn('Scanner error:', error)
          }
        }
      )
      controlsRef.current = controls
      setPermiso('concedido')
    } catch (e) {
      const msg = (e as Error).message ?? ''
      if (msg.includes('Permission') || msg.includes('NotAllowed')) {
        setPermiso('denegado')
      } else {
        setPermiso('denegado')
        console.error('Scanner init error:', e)
      }
    }
  }, [pendingCode])

  useEffect(() => {
    if (!modoManual) {
      iniciarScanner()
    }
    return () => {
      controlsRef.current?.stop()
    }
  }, [modoManual]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cuando se detecta un código, pausamos el scanner hasta que se resuelva el modal
  useEffect(() => {
    if (pendingCode) {
      controlsRef.current?.stop()
    }
  }, [pendingCode])

  function cancelarModal() {
    setPendingCode(null)
    setUbicacion('')
    procesandoRef.current = false
    // Reiniciar scanner
    iniciarScanner()
  }

  async function handleConfirmar(numeroPieza: string) {
    setConfirmando(true)
    const result = await confirmarRollo(ingresoId, numeroPieza, ubicacion)
    setConfirmando(false)

    if (!result.ok) {
      mostrarMensaje(result.error, result.codigo === 'YA_CONFIRMADO' ? 'warning' : 'error')
      setPendingCode(null)
      setUbicacion('')
      procesandoRef.current = false
      iniciarScanner()
      return
    }

    // Actualizar estado local del rollo confirmado
    setRollosLocales((prev) =>
      prev.map((r) =>
        r.numero_pieza === numeroPieza ? { ...r, estado: 'en_stock' } : r
      )
    )
    setPendingCode(null)
    setUbicacion('')
    procesandoRef.current = false

    if (result.ingresoCompleto) {
      mostrarMensaje('¡Todos los rollos confirmados! Ingreso cerrado.', 'success')
      // No reiniciamos scanner, el ingreso está completo
      return
    }

    mostrarMensaje(`Rollo ${result.rollo.numero_pieza} confirmado.`, 'success')
    iniciarScanner()
  }

  async function handleManual(e: React.FormEvent) {
    e.preventDefault()
    if (!codigoManual.trim()) return
    setConfirmando(true)
    const result = await confirmarRollo(ingresoId, codigoManual, ubicacion)
    setConfirmando(false)

    if (!result.ok) {
      mostrarMensaje(result.error, result.codigo === 'YA_CONFIRMADO' ? 'warning' : 'error')
      return
    }

    setRollosLocales((prev) =>
      prev.map((r) =>
        r.numero_pieza === codigoManual.trim() ? { ...r, estado: 'en_stock' } : r
      )
    )
    setCodigoManual('')
    setUbicacion('')

    if (result.ingresoCompleto) {
      mostrarMensaje('¡Todos los rollos confirmados! Ingreso cerrado.', 'success')
      setModoManual(false)
      return
    }

    mostrarMensaje(`Rollo ${result.rollo.numero_pieza} confirmado.`, 'success')
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Barra de progreso */}
      <div className="rounded-lg border bg-white p-4 shadow-sm space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">
            {confirmados} de {total} rollos confirmados
          </span>
          {totalDeclarado && totalDeclarado !== total && (
            <span className="text-xs text-warning">
              Planilla declara {totalDeclarado}
            </span>
          )}
          <span className="text-muted-foreground text-xs">{progresoPct}%</span>
        </div>
        <div className="w-full bg-zinc-100 rounded-full h-2">
          <div
            className="bg-primary h-2 rounded-full transition-all duration-500"
            style={{ width: `${progresoPct}%` }}
          />
        </div>

        {pendientes.length > 0 && (
          <button
            type="button"
            onClick={() => setMostrarPendientes((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {mostrarPendientes ? 'Ocultar' : 'Ver'} pendientes ({pendientes.length})
          </button>
        )}

        {mostrarPendientes && pendientes.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {pendientes.map((r) => (
              <span
                key={r.id}
                className="text-[11px] rounded bg-warning/10 text-warning px-1.5 py-0.5 font-mono"
              >
                {r.numero_pieza}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Mensaje flotante */}
      {mensaje && (
        <div
          className={`rounded-lg px-4 py-3 text-sm font-medium ${
            mensaje.tipo === 'success'
              ? 'bg-success/10 border border-success/30 text-success'
              : mensaje.tipo === 'warning'
                ? 'bg-warning/10 border border-warning/30 text-warning'
                : 'bg-destructive/10 border border-destructive/30 text-destructive'
          }`}
        >
          {mensaje.texto}
        </div>
      )}

      {/* Toggle scanner / manual */}
      <div className="flex rounded-lg border bg-white overflow-hidden shadow-sm">
        <button
          type="button"
          onClick={() => setModoManual(false)}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
            !modoManual ? 'bg-primary text-primary-foreground' : 'hover:bg-zinc-50'
          }`}
        >
          Escanear QR
        </button>
        <button
          type="button"
          onClick={() => {
            controlsRef.current?.stop()
            setModoManual(true)
            setPendingCode(null)
            procesandoRef.current = false
          }}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
            modoManual ? 'bg-primary text-primary-foreground' : 'hover:bg-zinc-50'
          }`}
        >
          Ingresar a mano
        </button>
      </div>

      {/* Modo manual */}
      {modoManual && (
        <form
          onSubmit={handleManual}
          className="rounded-lg border bg-white p-4 shadow-sm space-y-3"
        >
          <h3 className="font-medium text-sm">Confirmar rollo manualmente</h3>
          <div className="space-y-1">
            <label className="text-xs font-medium">Número de pieza *</label>
            <input
              value={codigoManual}
              onChange={(e) => setCodigoManual(e.target.value)}
              required
              placeholder="Ej: 204021911"
              inputMode="numeric"
              className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">
              Ubicación <span className="text-muted-foreground">(opcional)</span>
            </label>
            <input
              value={ubicacion}
              onChange={(e) => setUbicacion(e.target.value)}
              placeholder="Ej: A42"
              className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <button
            type="submit"
            disabled={confirmando || !codigoManual.trim()}
            className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {confirmando ? 'Confirmando...' : 'Confirmar rollo'}
          </button>
        </form>
      )}

      {/* Modo scanner */}
      {!modoManual && (
        <div className="rounded-lg border bg-black overflow-hidden shadow-sm relative">
          {permiso === 'denegado' ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-white px-6 text-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              <p className="font-medium">Sin acceso a la cámara</p>
              <p className="text-sm text-zinc-400">
                Permitir el acceso a la cámara desde la configuración del navegador, o usá el modo manual.
              </p>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                className="w-full aspect-[4/3] object-cover"
                playsInline
                muted
              />
              {/* Visor de escaneo */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-48 h-48 relative">
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl" />
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr" />
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl" />
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br" />
                </div>
              </div>
              {permiso === 'solicitando' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                  <p className="text-white text-sm">Iniciando cámara...</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Modal de confirmación cuando se detecta un código */}
      {pendingCode && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm space-y-4 p-5">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                Código detectado
              </p>
              <p className="font-mono text-lg font-bold mt-0.5">{pendingCode}</p>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">
                Ubicación <span className="text-muted-foreground text-xs">(opcional)</span>
              </label>
              <input
                value={ubicacion}
                onChange={(e) => setUbicacion(e.target.value)}
                placeholder="Ej: A42"
                className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                autoFocus
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={cancelarModal}
                className="flex-1 rounded-md border px-4 py-2.5 text-sm hover:bg-zinc-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleConfirmar(pendingCode)}
                disabled={confirmando}
                className="flex-1 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {confirmando ? 'Guardando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
