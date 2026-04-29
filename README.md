# StockApp

Sistema de gestión de stock de rollos textiles. Proyecto MVP de tesis (ITBA).

## Stack

- Next.js 16 (App Router) + TypeScript
- Tailwind CSS v4 + shadcn/ui
- Drizzle ORM + Supabase (Postgres + Auth + Storage) — *próxima etapa*
- Gemini 2.5 Flash para extracción de planillas — *próxima etapa*
- Despliegue en Vercel

## Correr local

```bash
npm install
npm run dev
```

Abrí [http://localhost:3000](http://localhost:3000).

## Estado

- ✅ **Etapa 0** — bootstrap (Next + Tailwind + shadcn, deploy a Vercel)
- ✅ **Etapa 1** — modelo de datos + auth con roles
- ⏳ Etapa 2 — ingreso manual de despacho
- ⏳ Etapa 3 — extracción IA + auditoría
- ⏳ Etapa 4 — confirmación física en mobile (scanner QR/barcode)
- ⏳ Etapa 5 — vista de stock
- ⏳ Etapa 6 — órdenes + picking
- ⏳ Etapa 7 — muestras + reportes
