export default function DepositoDashboard() {
  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold">Depósito</h1>
        <p className="text-muted-foreground text-sm mt-1">¿Qué vas a hacer hoy?</p>
      </div>

      <div className="flex flex-col gap-4">
        <button className="w-full rounded-2xl border-2 border-primary bg-primary/5 p-6 text-left active:scale-95 transition-transform">
          <span className="block text-lg font-semibold">
            Confirmar llegada de rollos
          </span>
          <span className="block text-sm text-muted-foreground mt-1">
            Escaneá o tocá los rollos que llegaron hoy
          </span>
        </button>

        <button className="w-full rounded-2xl border-2 p-6 text-left active:scale-95 transition-transform">
          <span className="block text-lg font-semibold">Picking de órdenes</span>
          <span className="block text-sm text-muted-foreground mt-1">
            Armar pedidos pendientes
          </span>
        </button>
      </div>
    </div>
  )
}
