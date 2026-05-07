'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import LogoutButton from './LogoutButton'

export type NavItem = {
  href: string
  label: string
  icon: string // emoji por simplicidad (Etapa 7 pasa a lucide-react)
  /** Si está deshabilitado (feature futura), se muestra opaco y no es clickeable. */
  disabled?: boolean
  /** Etiqueta opcional tipo "Etapa 4" para items deshabilitados. */
  comingSoon?: string
}

export type NavSection = {
  /** Si es null/undefined, no se muestra título. */
  title?: string
  items: NavItem[]
}

type Role = 'operario' | 'ventas' | 'admin' | 'super'

/**
 * Devuelve el link del "Home" para un rol (al que va el botón Home del header).
 */
function homeHref(role: Role): string {
  switch (role) {
    case 'operario':
      return '/operario/dashboard'
    case 'ventas':
      return '/ventas/dashboard'
    case 'admin':
      return '/admin/dashboard'
    case 'super':
      return '/super'
  }
}

/**
 * Construye la nav según el rol. Admin es superset funcional de operario y
 * ventas (filosofía PyMe: todos hacen de todo). Cada empresa-cliente tiene
 * un admin que también puede operar el depósito o crear pedidos cuando hace
 * falta, sin tener que cambiar de cuenta.
 */
function navForRole(role: Role): NavSection[] {
  if (role === 'super') {
    return [
      {
        items: [{ href: '/super', label: 'Empresas', icon: '🏢' }],
      },
    ]
  }

  if (role === 'operario') {
    return [
      {
        items: [
          { href: '/operario/dashboard', label: 'Inicio', icon: '🏠' },
          { href: '/operario/ingresos', label: 'Ingresos', icon: '📦' },
          { href: '/operario/confirmar', label: 'Confirmar llegadas', icon: '🔍' },
          {
            href: '/operario/picking',
            label: 'Picking',
            icon: '📋',
            disabled: true,
            comingSoon: 'Etapa 6',
          },
        ],
      },
    ]
  }

  if (role === 'ventas') {
    return [
      {
        items: [
          { href: '/ventas/dashboard', label: 'Inicio', icon: '🏠' },
          {
            href: '/stock',
            label: 'Stock',
            icon: '📦',
            disabled: true,
            comingSoon: 'Etapa 5',
          },
          {
            href: '/ventas/pedidos',
            label: 'Pedidos',
            icon: '🛒',
            disabled: true,
            comingSoon: 'Etapa 6',
          },
        ],
      },
    ]
  }

  // admin: superset de operario + ventas + sus propias secciones
  return [
    {
      items: [{ href: '/admin/dashboard', label: 'Inicio', icon: '🏠' }],
    },
    {
      title: 'Operación',
      items: [
        { href: '/operario/ingresos', label: 'Ingresos', icon: '📦' },
        { href: '/operario/confirmar', label: 'Confirmar llegadas', icon: '🔍' },
        {
          href: '/operario/picking',
          label: 'Picking',
          icon: '📋',
          disabled: true,
          comingSoon: 'Etapa 6',
        },
      ],
    },
    {
      title: 'Ventas',
      items: [
        {
          href: '/stock',
          label: 'Stock',
          icon: '🔎',
          disabled: true,
          comingSoon: 'Etapa 5',
        },
        {
          href: '/ventas/pedidos',
          label: 'Pedidos',
          icon: '🛒',
          disabled: true,
          comingSoon: 'Etapa 6',
        },
      ],
    },
    {
      title: 'Administración',
      items: [
        { href: '/admin/articulos', label: 'Artículos', icon: '📋' },
        { href: '/admin/tintorerias', label: 'Tintorerías', icon: '🏭' },
        { href: '/admin/equipo', label: 'Equipo', icon: '👥' },
      ],
    },
  ]
}

const ROLE_LABEL: Record<Role, string> = {
  super: 'Super-admin',
  admin: 'Administrador',
  operario: 'Operario',
  ventas: 'Ventas',
}

export default function AppShell({
  role,
  userName,
  empresaNombre,
  children,
}: {
  role: Role
  userName: string
  empresaNombre: string | null
  children: React.ReactNode
}) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const sections = navForRole(role)
  const home = homeHref(role)

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 md:flex-row">
      {/* Header solo en mobile (en desktop la nav está en el sidebar lateral) */}
      <header className="md:hidden border-b bg-white px-3 py-3 flex items-center justify-between gap-2 sticky top-0 z-20">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="rounded-md p-2 hover:bg-zinc-100 active:bg-zinc-200"
          aria-label="Abrir menú"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        <Link
          href={home}
          className="flex-1 min-w-0 hover:text-primary"
        >
          <span className="block font-semibold text-sm truncate">
            StockApp{empresaNombre ? ` · ${empresaNombre}` : ''}
          </span>
          <span className="block text-[11px] text-muted-foreground truncate">
            {ROLE_LABEL[role]}
          </span>
        </Link>

        <Link
          href={home}
          aria-label="Inicio"
          className="rounded-md p-2 hover:bg-zinc-100 active:bg-zinc-200 shrink-0"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
        </Link>
      </header>

      {/* Sidebar desktop (≥768px) */}
      <SidebarContent
        sections={sections}
        empresaNombre={empresaNombre}
        userName={userName}
        roleLabel={ROLE_LABEL[role]}
        home={home}
        className="hidden md:flex flex-col w-60 lg:w-64 border-r bg-white shrink-0 sticky top-0 self-start max-h-screen"
      />

      {/* Drawer mobile (<768px) */}
      {drawerOpen && (
        <div
          className="md:hidden fixed inset-0 z-30 bg-black/50"
          onClick={() => setDrawerOpen(false)}
        >
          <div
            className="absolute top-0 left-0 bottom-0 w-72 max-w-[85vw] bg-white shadow-xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">
                  StockApp{empresaNombre ? ` · ${empresaNombre}` : ''}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {ROLE_LABEL[role]}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="rounded-md p-1.5 hover:bg-zinc-100 shrink-0"
                aria-label="Cerrar menú"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <SidebarContent
              sections={sections}
              empresaNombre={empresaNombre}
              userName={userName}
              roleLabel={ROLE_LABEL[role]}
              home={home}
              onItemClick={() => setDrawerOpen(false)}
              className="flex flex-col flex-1 min-h-0"
              hideHeader
            />
          </div>
        </div>
      )}

      {/* Contenido */}
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  )
}

function SidebarContent({
  sections,
  empresaNombre,
  userName,
  roleLabel,
  home,
  className,
  hideHeader,
  onItemClick,
}: {
  sections: NavSection[]
  empresaNombre: string | null
  userName: string
  roleLabel: string
  home: string
  className?: string
  hideHeader?: boolean
  onItemClick?: () => void
}) {
  const pathname = usePathname()

  return (
    <aside className={className}>
      {!hideHeader && (
        <div className="px-4 py-4 border-b">
          <Link
            href={home}
            className="block font-semibold text-sm hover:text-primary truncate"
          >
            StockApp{empresaNombre ? ` · ${empresaNombre}` : ''}
          </Link>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {roleLabel}
          </p>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {sections.map((section, i) => (
          <div key={i} className="space-y-1">
            {section.title && (
              <p className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-1 pb-1">
                {section.title}
              </p>
            )}
            {section.items.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== home && pathname.startsWith(item.href + '/'))
              if (item.disabled) {
                return (
                  <div
                    key={item.href}
                    className="flex items-center gap-3 px-3 py-2 text-sm text-muted-foreground/60 cursor-not-allowed select-none"
                    title={item.comingSoon}
                  >
                    <span className="text-base">{item.icon}</span>
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.comingSoon && (
                      <span className="text-[10px] uppercase tracking-wide">
                        {item.comingSoon}
                      </span>
                    )}
                  </div>
                )
              }
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onItemClick}
                  className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-zinc-100 active:bg-zinc-200'
                  }`}
                >
                  <span className="text-base">{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      <div className="border-t px-4 py-3 space-y-2">
        <p className="text-xs text-muted-foreground truncate">{userName}</p>
        <LogoutButton />
      </div>
    </aside>
  )
}
