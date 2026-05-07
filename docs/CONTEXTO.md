# StockApp — Contexto del proyecto

> **Cómo usar este documento**: pegá esto al inicio de un chat nuevo cuando quieras retomar el desarrollo desde otra sesión. Está pensado para que un asistente (Claude o quien sea) tenga todo el contexto necesario para seguir colaborando sin que tengas que re-explicar el proyecto.

---

## 1. Identidad y stakeholders

**Producto**: StockApp — sistema multi-tenant de gestión de stock de rollos textiles para PyMEs argentinas.

**Cliente principal de validación**: Muter Textil (fábrica textil con tintorería tercerizada).

**Naturaleza**: MVP de tesis (ITBA — Instituto Tecnológico de Buenos Aires), pensado para escalar y vender a múltiples empresas textiles.

**Equipo de desarrollo**: 4 estudiantes (Trinidad Silva Felgueras lidera el dev). Al menos 1-2 más necesitan acceso de super-admin para ayudar con onboarding de clientes.

**Repo**: https://github.com/tsilvafelgueras/stockapp-tesis (privado, GitHub).

**Path local**: `C:\dev\stockapp-tesis` (intencionalmente fuera de OneDrive, porque OneDrive sincroniza `node_modules` y eso rompe).

**URL en producción**: https://stockapp-tesis.vercel.app

---

## 2. Estilo de colaboración (importante)

- **Argentine Spanish** en todas las respuestas y en la UI.
- **Propose-then-act**: antes de tocar archivos o tomar decisiones técnicas no triviales, explicar qué se va a hacer y esperar OK explícito.
- **Etapas chicas y verificables**: cada etapa termina en algo que la usuaria puede correr y probar antes de avanzar.
- **Sin gold-plating**: priorizar el flujo end-to-end aunque sea simple sobre features perfectas a medias.
- **Cuestionar el pedido si no cierra**: si algo no tiene sentido o se puede simplificar, decirlo en vez de implementarlo igual.
- **Cost-conscious**: solo herramientas con free tier real. Hoy todo corre en $0/mes.

---

## 3. Stack técnico

| Capa | Tecnología | Notas |
|---|---|---|
| Frontend / Backend | Next.js 16 (App Router) + TypeScript | Un solo repo, Server Actions para la lógica del backend |
| UI | Tailwind CSS v4 + shadcn/ui | Tema custom: paleta navy + naranja |
| DB / Auth / Storage | Supabase (Postgres + Auth + Storage) | Tier gratis. Region: `sa-east-1` (São Paulo) |
| ORM | Ninguno — cliente Supabase JS directo | `@supabase/supabase-js` + `@supabase/ssr` |
| Hosting | Vercel | Region `gru1` (São Paulo) en `vercel.json` para reducir latencia |
| Scanner códigos | `@zxing/browser` (planeado, no instalado aún) | Etapa 4 |
| IA | Gemini 2.5 Flash via `@google/genai` (planeado) | Etapa 3. Único modelo con free tier sin tarjeta |

**Versiones de runtime**: Node.js 24 LTS, npm 11.

**Paleta de colores** (en `src/app/globals.css`, formato oklch):
- Primary (navy): `#1A2744`
- Warning (naranja): `#E8913A`
- Success (verde): `#2E7D32`
- Destructive (rojo): `#C62828`

---

## 4. Modelo de roles

4 roles, definidos en `profiles.role`:

| Rol | Quién | Dónde trabaja | Qué hace |
|---|---|---|---|
| `operario` | Personal de depósito | Mobile-first | Carga ingresos manualmente o con IA, escanea QR/código de barras para confirmar llegadas, asigna ubicaciones, hace picking de pedidos |
| `ventas` | Empleados de ventas (ej: Belén en Muter) | Desktop | Ve stock, crea pedidos seleccionando rollos específicos, asocia con número de remito externo |
| `admin` | Dueño/gerente de **una empresa-cliente** | Desktop / Mobile | Gestiona catálogos, equipo, ve reportes, hace bajas, libera reservas. **Filosofía PyMe**: el admin tiene acceso a TODO lo de operario y ventas (no son funciones principales pero está habilitado para tomar tareas de cualquier área cuando hace falta). El sidebar le muestra todos los links agrupados por sección. |
| `super` | Trinidad y compañeras (gestionan la plataforma StockApp en sí) | Desktop | Crea empresas-cliente, invita primeros admins, ve todas las empresas. NO pertenece a ninguna empresa-cliente |

**Reglas duras (enforced en DB con CHECK constraint)**:
- `role = 'super'` → `empresa_id IS NULL`
- `role IN ('admin', 'ventas', 'operario')` → `empresa_id IS NOT NULL`

---

## 5. Multi-tenant

Cada empresa-cliente tiene **datos completamente aislados**. Belén de Empresa A nunca puede ver un solo dato de Empresa B.

**Cómo se enforza**:
- Tabla `empresas` central
- Cada tabla tenant-specific (profiles, articulos, tintorerias, despachos, rollos, pedidos, pedido_rollos) tiene `empresa_id UUID REFERENCES empresas(id)` NOT NULL
- RLS policies en cada tabla filtran por `empresa_id = current_empresa_id() OR is_super_admin()`
- Trigger BEFORE INSERT en cada tabla auto-rellena `empresa_id` desde el perfil del usuario actual (la app no necesita setearlo explícitamente)
- Helper functions: `current_empresa_id()` y `is_super_admin()` (ambas SECURITY DEFINER, leen del perfil del `auth.uid()`)

---

## 6. Modelo de datos / schema

Tablas principales:

### `empresas`
- id, nombre, activo, created_at
- Lo gestiona super-admin desde `/super`

### `profiles` (extiende `auth.users`)
- id (FK a auth.users), nombre, role (`operario`|`ventas`|`admin`|`super`), empresa_id (nullable solo si super), created_at
- CHECK constraint enforza la regla super ↔ empresa_id NULL

### `articulos`
- id, empresa_id, nombre, descripcion, activo, created_at
- Lo gestionan admin Y operario (lo deciden por flow real: a veces operario carga tintorerías nuevas en el momento)

### `tintorerias`
- id, empresa_id, nombre, activo, created_at
- **Post-008**: agrega `extraction_config_key TEXT NULL`. Es el identificador de la config de extracción IA específica de esa tintorería (matchea con un archivo en `src/lib/extraccion/tintorerias/{key}.ts`). Si NULL, se usa el prompt default. **Lo seteamos los devs vía SQL** cuando damos de alta una tintorería con formato específico — el admin de la empresa-cliente NO ve ni edita esto.
- Mismas reglas RLS que articulos

### `ingresos` (renombrada desde `despachos` en migración 008)
- id, empresa_id, tintoreria_id, articulo_id, fecha_despacho, numero_remito, total_rollos_declarado, total_kilos_declarado, estado, **origen** (`manual`|`planilla_ia`), imagen_url, created_by, created_at
- **Post-007** agrega: `color` (movido desde rollos), `ot`, `rem_tejeduria`, `referencia` (todos TEXT NULL)
- Estados: `borrador` → `auditado` → `confirmado`
- "Ingreso" = una llegada de mercadería con su remito (header). Los rollos son las "líneas". Se llamaba `despachos` pero "despacho" era ambiguo (también lo usábamos para "despacho a cliente" = pedido). Renombre en migración 008.

### `rollos`
- id, empresa_id, ingreso_id, articulo_id, numero_pieza (string), **ubicacion** (slot tipo "A42"), pantone, foto_url, kilos, metros, ratio_rendimiento, kilos_propios, metros_propios, ancho_propio, gramaje_propio, estado, confianza_ia, gramaje_planilla, created_at
- **Post-007**: `codigo_externo` ELIMINADO (era redundante: el QR físico codifica el mismo `numero_pieza`). `color` ELIMINADO (se movió a `ingresos`). Se agrega `gramaje_planilla NUMERIC(5,2) NULL`.
- **Post-008**: la columna FK `despacho_id` se renombró a `ingreso_id`.
- Estados: `pendiente` → `en_stock` → `reservado` → `entregado`
- Salidas adicionales: `reservado` → `en_stock` (cancelación), cualquiera → `baja` (dueño)
- UNIQUE (ingreso_id, numero_pieza)

### `pedidos`
- id, empresa_id, numero_pedido, cliente, **numero_remito_externo** (link al sistema de facturación tipo Softland), estado, created_by, created_at
- Estados: `pendiente` → `en_preparacion` → `lista` → `entregada` (o `cancelada`)

### `pedido_rollos` (m2m)
- id, empresa_id, pedido_id, rollo_id, created_at
- UNIQUE (rollo_id) — un rollo solo puede estar en un pedido a la vez

**No existen** las tablas `orden_items` ni `asignaciones` (estaban en una versión vieja del schema, fueron dropeadas en la migración 001).

---

## 7. Estructura del código

```
src/
├── app/                          # Next.js App Router
│   ├── page.tsx                  # Root → redirige según rol
│   ├── layout.tsx                # Root layout (metadata, fonts)
│   ├── globals.css               # Tailwind + theme tokens (navy + naranja)
│   ├── login/page.tsx            # Login email + password
│   │
│   ├── auth/
│   │   ├── confirm/route.ts      # Route handler que verifica token de invitación
│   │   └── setup/                # Pantalla para que invitado defina contraseña
│   │       ├── page.tsx
│   │       └── SetupForm.tsx
│   │
│   ├── super/                    # Solo role='super'
│   │   ├── layout.tsx
│   │   ├── page.tsx              # Lista empresas + form para crear nueva
│   │   ├── NuevaEmpresaForm.tsx
│   │   └── actions.ts            # createEmpresaConAdmin()
│   │
│   ├── admin/                    # Solo role='admin'
│   │   ├── layout.tsx
│   │   ├── dashboard/page.tsx
│   │   ├── articulos/            # CRUD de artículos
│   │   ├── tintorerias/          # CRUD de tintorerías
│   │   └── equipo/               # Lista usuarios + invita
│   │       ├── page.tsx
│   │       ├── InviteForm.tsx
│   │       └── actions.ts        # inviteTeamMember()
│   │
│   ├── ventas/                   # role='ventas' o 'admin'
│   │   ├── layout.tsx
│   │   └── dashboard/page.tsx    # Solo placeholder (Etapa 6)
│   │
│   └── operario/                 # role='operario' o 'admin'
│       ├── layout.tsx
│       ├── dashboard/page.tsx
│       └── despachos/            # ← acá está el form complejo de Etapa 2
│           ├── page.tsx          # Lista despachos
│           ├── [id]/page.tsx     # Detalle de un despacho
│           └── nuevo/
│               ├── page.tsx
│               ├── NuevoDespachoForm.tsx  # Form con tabla editable de rollos
│               └── actions.ts            # createDespacho() + creates inline de catálogos
│
├── lib/
│   └── supabase/
│       ├── client.ts             # createBrowserClient (para Client Components)
│       ├── server.ts             # createServerClient (para Server Components/Actions)
│       ├── middleware.ts         # Sesión + guards por rol
│       └── admin.ts              # Service-role client (bypassa RLS, solo para super-admin actions)
│
├── components/
│   ├── ui/button.tsx             # Solo este de shadcn está instalado
│   └── LogoutButton.tsx
│
└── middleware.ts                 # Wrapper que llama a updateSession()

supabase/
├── schema.sql                    # Schema canónico para fresh installs
└── migrations/                   # Historial idempotente
    ├── 001_etapa2_refactor.sql              # 3 roles, drop orden_items, rename ordenes→pedidos
    ├── 002_despacho_origen.sql              # despachos.origen
    ├── 003_operario_gestiona_catalogos.sql  # RLS para que operario CRUD catálogos
    ├── 004_operario_inserta_despachos_rollos.sql  # operario INSERT en despachos+rollos
    ├── 005_multi_tenant.sql                 # Tabla empresas, empresa_id en todas las tablas, triggers, RLS
    └── 006_super_admin_internal_empresa.sql # role='super' + empresa_id NULLABLE para super

vercel.json                       # regions: ["gru1"] (São Paulo)
.env.local                        # (gitignored) NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
```

---

## 8. Migraciones aplicadas (orden)

Todas idempotentes, todas pegadas en Supabase SQL Editor.

| # | Qué hace |
|---|---|
| 001 | Refactor inicial: 3 roles (operario/ventas/admin), drop orden_items+asignaciones, rename ordenes→pedidos, agrega numero_remito_externo, drop estados viejos |
| 002 | `despachos.origen` (`manual` \| `planilla_ia`) |
| 003 | RLS: operario también puede CRUD `articulos` y `tintorerias` |
| 004 | RLS: operario también puede INSERT en `despachos` y `rollos` (no solo UPDATE) |
| 005 | **Multi-tenant**. Tabla `empresas`, `empresa_id` en todas, RLS por empresa, trigger auto-set, helper functions |
| 006 | Super-admin como rol propio (`role='super'`), empresa_id NULLABLE solo para super, CHECK constraint |
| 007 | **Cleanup pre-IA** (Etapa 3): `color` movido de `rollos` a `despachos` (1 lote = 1 color), `codigo_externo` eliminado de `rollos` (redundante con `numero_pieza`), agrega `ot/rem_tejeduria/referencia` en `despachos` y `gramaje_planilla` en `rollos` para trazabilidad de planilla |
| 008 | **Rename + config por tintorería** (post-test E2E): `despachos` renombrada a `ingresos` (+ `rollos.despacho_id` → `ingreso_id`). Agrega `tintorerias.extraction_config_key` para sistema de prompts IA específicos por tintorería. |

**Schema canónico**: ⚠ `supabase/schema.sql` está **DESACTUALIZADO** — refleja solo Etapa 2 base, sin migraciones 005/006/007/008. Para DB nueva: correr `schema.sql` + todas las migraciones en orden. Actualización pendiente agendada en Etapa 7D.

---

## 9. Flujo de autenticación / invitaciones

**Login**: email + password en `/login`. Una vez logueado, middleware redirige según rol.

**Cómo se crea un usuario nuevo** (ningún sign-up público):

### Caso 1 — Super-admin crea empresa-cliente nueva

1. Trinidad entra a `/super`.
2. Click "+ Nueva empresa", llena nombre + datos del primer admin (nombre + mail real).
3. El server action `createEmpresaConAdmin`:
   - Inserta empresa con admin client (bypassa RLS)
   - Llama `admin.auth.admin.inviteUserByEmail(email, { data: { nombre, role: 'admin', empresa_id }, redirectTo: <site>/auth/confirm?next=/auth/setup })`
4. Supabase manda email al admin invitado.
5. Admin invitado clickea link → `/auth/confirm` → verifica token con `verifyOtp` → redirige a `/auth/setup`.
6. En `/auth/setup` define su contraseña. Ya queda logueado.
7. Lo redirige al dashboard de SU empresa.

### Caso 2 — Admin de una empresa invita a su equipo

Mismo flow pero desde `/admin/equipo`. El rol va en el form (operario|ventas|admin), `empresa_id` se hereda automáticamente del admin que invita.

### ⚠ Email template configurado en Supabase

Por default Supabase usa el flow **legacy** que no funciona con SSR. Hay que customizar el template en:
**Supabase → Authentication → Email Templates → "Invite user"**

```html
<h2>Te invitaron a StockApp</h2>
<p>Hacé click acá para configurar tu contraseña:</p>
<p>
  <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/auth/setup">
    Configurar contraseña y entrar
  </a>
</p>
```

**Site URL** y **Redirect URLs** en Supabase Auth tienen que tener `https://stockapp-tesis.vercel.app` y `/auth/confirm`.

---

## 10. Plan de etapas detallado

### Estado actual

| # | Etapa | Estado |
|---|---|---|
| 0 | Bootstrap (Next + Tailwind + shadcn + deploy) | ✅ |
| 1 | Modelo de datos + auth con roles | ✅ |
| 2 | Ingreso manual de despacho con sus rollos | ✅ |
| Multi-tenant | (no era etapa, se metió entre 2 y 3) | ✅ pendiente último test de invitación con email template fixeado |
| 3 | Extracción IA con configs por tintorería + sidebar/nav + mobile-first | ✅ completa post-correcciones |
| **4** | **Confirmación física en mobile (scanner QR)** | ✅ completa |
| 5 | Vista de stock con filtros | ⏳ próxima |
| 6 | Pedidos + picking | ⏳ |
| 7 | Muestras + reportes + rediseño UI/UX | ⏳ |

### Polish acordado

En cada etapa que se cierre, dedicar 20-30 min a que las pantallas nuevas no queden crudas (espaciado, copy, estados de carga básicos). En **Etapa 7** se hace el rediseño grande con sidebar, drawer mobile, toasts, dialogs, etc.

---

### Etapa 3 — Extracción IA de planilla + auditoría relajada

**Objetivo**: el admin u operario sube foto o PDF de la planilla de tintorería. Una IA (Gemini 2.5 Flash) extrae los rollos en formato tabla, usando un prompt **específico de la tintorería elegida** (cada tintorería tiene su propio config). El usuario audita rápido (umbral de confianza visual, sin validación celda-por-celda) y guarda. Los rollos quedan en estado `pendiente` hasta que en Etapa 4 el operario los confirme físicamente con scanner. Es el feature **diferenciador del MVP**.

#### Decisiones acordadas en grilling (mayo 2026)

1. **Modelo B confirmado**: planilla IA crea rollos `pendiente` → scanner físico (Etapa 4) los pasa a `en_stock`.
2. **Admin Y operario pueden subir planilla** en Etapa 3. Ventas NO (su rol es crear pedidos, no cargar ingresos). La pantalla `/operario/ingresos/nuevo` (existente desde Etapa 2) se extiende con un toggle "Cargar a mano" / "Subir planilla con IA" — admin accede al mismo path porque es superset de operario. Cero duplicación de código.
3. **Diseño desktop-first** (admin típicamente está en oficina con PC). Mobile-first sigue aplicando para Etapa 4 (operario en depósito con celu).
4. **Side-by-side cancelado**: el admin tiene la planilla física en la mano (o la imagen en otra ventana), no necesita comparar contra una imagen embebida. Layout simple: tabla editable a pantalla completa. Imagen guardada en Storage queda accesible vía thumbnail/modal por si hace falta.
5. **Multi-formato planilla**: solo **foto (JPG/PNG) y PDF** en MVP. Excel queda postergado (la mayoría de tintorerías mandan foto/PDF; Excel es <10% según user).
6. **`codigo_externo` se elimina del schema**: en la realidad textil, el QR/barcode del rollo físico codifica el mismo `numero_pieza` que figura en la planilla. No hay un código separado. Migración 007 lo dropea.
7. **Color va de `rollos` a `despachos`**: cada despacho de entrada (tintorería → depósito) es **monocromo** (la tintorería tiñe lotes de un color). Los pedidos a cliente (depósito → cliente) sí pueden mezclar colores y eso funciona vía la m2m `pedido_rollos` ya existente. Migración 007 mueve el campo.
8. **Campos extra de trazabilidad guardados**: la planilla trae OT (orden de trabajo), REM.TEJ. (remito de tejeduría), REFERENCIA y Pm2 (gramaje). Los 4 se guardan ahora en migración 007 (nullables) por si se necesita trazabilidad futura. Costo cero.
9. **Auditoría relajada**: celdas con confianza <0.85 aparecen con borde amarillo + tooltip, pero NO bloquean el guardado. El admin tiene la planilla al lado, escanea visualmente, corrige lo que ve mal, guarda. Sin flow paso-a-paso obligatorio.
10. **Fallback 3-tier blando**:
    - **Falla técnica de la IA** (timeout, JSON inválido) → mensaje + botón "Reintentar IA" + botón "Cargar a mano" (cae al modo Etapa 2 con la imagen ya guardada visible en thumbnail).
    - **Extracción incompleta** (header dice 24 rollos, IA extrajo 18) → banner amarillo "Faltan 6 rollos, agregalos a mano". No bloquea.
    - **Calidad pobre** (>30% de celdas <0.85 confianza) → banner gris con recomendación. No bloquea.
    La filosofía: avisar fuerte, NUNCA bloquear el guardado en Etapa 3. El bloqueo duro es de Etapa 4 (scanner).
11. **Caso "rollos llegan sin planilla" postergado a Etapa 7**. Ocurre "a veces" (~10-25% según user). Se va a medir en uso real con Muter; si confirma frecuencia alta, se construye flow de cross-check entonces.

#### Correcciones post-test E2E (mayo 2026)

Después del primer test de la Etapa 3 base, el user identificó 6 cosas a corregir. Se implementaron en una iteración inmediata antes de declarar Etapa 3 cerrada.

1. **Mobile-first del form completo**. La tabla densa solo se ve en desktop (≥640px). En mobile, cada rollo es un card con grid 2-col de inputs, labels chicos arriba, `inputMode="decimal/numeric"` para teclados móviles correctos. El header del ingreso pasa de 3 columnas a 1 en mobile.
2. **Sidebar + drawer mobile + botón Home**. Componente único `src/components/AppShell.tsx` consumido por los 4 layouts (operario/admin/ventas/super). En desktop sidebar fijo a la izquierda; en mobile drawer hamburger desde la izquierda. Botón Home explícito en el header mobile (ícono de casa).
3. **Permisos cruzados PyMe**: el admin tiene en su sidebar TODOS los links — no solo los de admin sino también los de operario (Ingresos, Confirmar, Picking) y ventas (Stock, Pedidos). Filosofía: "es una PyMe, todos hacen de todo cuando hace falta". Los items disabled muestran badge "Etapa X" de la sección que los habilita.
4. **Rename `despachos` → `ingresos`** en toda la app (tabla, columna FK, paths URL, tipos TS, textos UI). Migración 008 hace el rename SQL idempotente. La palabra "despacho" creaba ambigüedad con "despacho a cliente" (que en el schema es `pedidos`).
5. **Sistema de prompts por tintorería** (cambio arquitectural): cada tintorería con formato específico tiene su propio archivo en `src/lib/extraccion/tintorerias/{key}.ts`. El usuario selecciona tintorería **antes** de subir la planilla (paso 1 explícito en la UI). El server action busca el `extraction_config_key` de esa tintorería y le pasa el prompt específico a Gemini. Si la tintorería tiene config `null`, se usa el prompt default genérico. **Workflow de alta**: cliente nos avisa nueva tintorería → recibimos planillas de muestra → creamos archivo `.ts` con la config → commit + deploy → SQL: `UPDATE tintorerias SET extraction_config_key = '{key}' WHERE id = '...'`. El admin de la empresa-cliente NO ve ni edita esto.
6. **Ventas en Etapa 6**: confirmado que ventas hoy solo tiene dashboard placeholder. Se desarrolla entero en Etapa 6 (pedidos + picking). Mientras tanto, el admin puede cubrir las funciones de ventas si hace falta.

#### Plan de sub-etapas

**3.0 — Migración 007: cleanup de schema**
- Mover `color` de `rollos` a `despachos`
- Eliminar `codigo_externo` de `rollos`
- Agregar `ot`, `rem_tejeduria`, `referencia` a `despachos` (TEXT NULL)
- Agregar `gramaje_planilla` a `rollos` (NUMERIC(5,2) NULL)
- Idempotente como las anteriores
- Aplicar en Supabase SQL Editor antes de tocar código

**3.1 — Setup infra (~30 min, requiere acción manual del user)**
- Cuenta gratis en https://aistudio.google.com, generar API key Gemini 2.5 Flash
- `GEMINI_API_KEY` en `.env.local` y Vercel (Production + Preview, sensitive)
- Bucket privado `planillas` en Supabase Storage + RLS por `current_empresa_id()`
- `npm install @google/genai`

**3.2 — Función pura de extracción**
- `src/lib/extraccion/extraerPlanilla.ts`: tipos `IngresoExtraido`, `RolloExtraido` con `confianza` por campo. Función `extraerPlanilla(buffer, mimeType, configKey)`.
- `src/lib/extraccion/gemini.ts`: implementación con `responseSchema` estructurado. Construye el prompt mergeando `PROMPT_BASE` + las instrucciones específicas de la config de la tintorería elegida.

**3.3 — Storage helpers**
- `src/lib/storage/planillas.ts`: upload con path `{empresa_id}/{yyyy-mm}/{uuid}.{ext}`, devuelve URL firmada para mostrar imagen guardada.

**3.4 — UI extendida en `/operario/ingresos/nuevo`**
- Toggle al inicio: "Cargar a mano" (default) / "Planilla con IA"
- En modo IA: paso 1 obligatorio = elegir tintorería; paso 2 = drag-drop (foto/PDF) → spinner → auto-fill de tabla editable.
- Una vez subida la planilla, el dropdown de tintorería queda **bloqueado** (cambiarla = cambiar config = empezar de cero).
- Tabla con celdas de baja confianza marcadas con borde naranja (color "warning" del tema, paleta navy+naranja).
- Banners de fallback 3-tier (falla técnica / extracción incompleta / calidad pobre).
- Mobile-first: cards apilados en mobile (≤640px), tabla densa en desktop.

**3.5 — Sistema de configs por tintorería** (post-test correction)
- `src/lib/extraccion/tintorerias/_types.ts`: tipo `TintoreriaConfig`.
- `src/lib/extraccion/tintorerias/_default.ts`: config genérica (cuando `extraction_config_key = null`).
- `src/lib/extraccion/tintorerias/_registry.ts`: mapa `key → config`. Función `getConfig(key | null)` que devuelve el default si no encuentra.
- `src/lib/extraccion/tintorerias/muter-textil.ts`: config para Muter (24 rollos en 3 bloques paralelos, header lateral).
- Para agregar tintorería nueva: crear archivo `.ts` + agregarlo al registry + commit + `UPDATE tintorerias SET extraction_config_key = '{key}'` por SQL.

**3.6 — Persistencia y verificación E2E**
- Server action `crearIngreso`: crea ingreso con `origen='planilla_ia'`, `estado='auditado'` y rollos en `pendiente`. Si origen='manual', el estado deriva de los rollos.
- Verificable: el usuario sube la planilla de Muter, selecciona tintorería "Muter Textil" (que tiene `extraction_config_key='muter-textil'`), ve la tabla extraída con confianza visual, corrige lo que la IA leyó mal, guarda, ve el ingreso cargado en estado `auditado` con N rollos en `pendiente`.

**Archivos nuevos**:
- `supabase/migrations/007_cleanup_schema_pre_ia.sql`, `008_rename_despachos_a_ingresos.sql`
- `src/lib/extraccion/extraerPlanilla.ts`, `src/lib/extraccion/gemini.ts`
- `src/lib/extraccion/tintorerias/{_types,_default,_registry,muter-textil}.ts`
- `src/lib/storage/planillas.ts`
- `src/components/AppShell.tsx` (sidebar + drawer + botón Home, usado por los 4 layouts)

**Archivos modificados**:
- `src/app/operario/ingresos/nuevo/NuevoIngresoForm.tsx` (renombrado desde NuevoDespachoForm)
- `src/app/operario/ingresos/nuevo/actions.ts`
- `src/app/operario/ingresos/page.tsx` y `[id]/page.tsx` (mobile-first)
- `src/app/{operario,admin,ventas,super}/layout.tsx` (todos usan AppShell)
- `src/app/{operario,admin}/dashboard/page.tsx` (links actualizados a `/ingresos`)

**Variables de entorno nuevas**: `GEMINI_API_KEY`.

**Tiempo estimado**: 6-8 horas guiadas (incluye correcciones post-test E2E).

---

### Etapa 4 — Confirmación física por scanner ✅

**Objetivo**: el operario va al depósito con su celular, escanea cada rollo físico, asigna ubicación, y el rollo pasa de `pendiente` a `en_stock`. Es la "aduana" del sistema.

**Pasos**:
1. **Instalar scanner library**: `npm install @zxing/browser @zxing/library`.
2. **Pantalla `/operario/confirmar`** (lista):
   - Lista de despachos con al menos 1 rollo en estado `pendiente`.
   - Cada despacho muestra: tintorería, fecha, "X de Y rollos pendientes".
   - Click → entra al modo scanner del despacho.
3. **Pantalla `/operario/confirmar/[despacho_id]`** (modo scanner):
   - Cámara fullscreen mobile (con permission request).
   - Detector zxing corriendo en loop, intenta cada frame.
   - Soporta QR, Code128, EAN-13, EAN-8, ITF.
4. **Lógica de match** al escanear un código:
   - Buscar `rollo` donde `numero_pieza = X AND despacho_id = id AND estado = 'pendiente'` (post-007 `codigo_externo` ya no existe; el QR físico codifica el `numero_pieza`).
   - Si **match único**: dialog "Rollo X" → input "Ubicación (ej: A42)" → guardar → rollo pasa a `en_stock`.
   - Si **no match**: error rojo "Este código no pertenece a este despacho" + botón "Ingresar manualmente".
   - Si **ya escaneado**: error "Ya confirmado".
   - **Pendiente confirmar (en grilling de Etapa 4)**: si los rollos físicos vienen con QR/Code128 escaneable o solo número impreso. Si es solo número impreso, el flow cambia (necesita OCR de cámara o tipeo manual).
5. **Progreso visible** arriba:
   - Banner: "12 de 24 rollos confirmados".
   - Lista colapsable de pendientes (números de pieza).
6. **Fallback manual**: botón "Ingresar a mano" → busca rollo por número de pieza → asigna ubicación.
7. **Cierre del despacho**:
   - Cuando todos los rollos pasan a `en_stock`, el despacho pasa a `confirmado` automáticamente.
   - Mensaje de éxito + redirect al listado.

**Archivos nuevos**:
- `src/app/operario/confirmar/page.tsx`
- `src/app/operario/confirmar/[id]/page.tsx`
- `src/app/operario/confirmar/[id]/Scanner.tsx` (Client component con zxing)
- `src/app/operario/confirmar/[id]/actions.ts` (`confirmarRollo()`)

**Verificable**: con un ingreso cargado por IA en estado `auditado` (rollos en `pendiente`), ir a `/operario/confirmar`, escanear los códigos físicos uno por uno, ver progreso en tiempo real, intentar escanear un código equivocado y ver el bloqueo, terminar con ingreso en `confirmado`.

**Tiempo estimado**: 3-4 horas.

#### Implementación real (mayo 2026)

**Archivos creados**:
- `src/app/operario/confirmar/page.tsx`: lista de ingresos con rollos pendientes, mini barra de progreso por ingreso
- `src/app/operario/confirmar/[id]/page.tsx`: header del ingreso + renderiza Scanner
- `src/app/operario/confirmar/[id]/Scanner.tsx`: Client component — cámara con `@zxing/browser`, visor de escaneo con esquinas, modal de ubicación al detectar código, barra de progreso, lista colapsable de pendientes, toggle "Ingresar a mano" como fallback
- `src/app/operario/confirmar/[id]/actions.ts`: `confirmarRollo(ingresoId, numeroPieza, ubicacion)` — valida que el rollo pertenezca al ingreso, rechaza si ya está confirmado, cierra ingreso automáticamente cuando todos pasan a `en_stock`

**Dependencias instaladas**: `@zxing/browser@0.2.0`, `@zxing/library@0.22.0`

**Confirmado con el cliente**: los rollos físicos de Muter tienen QR/barcode escaneable (no es solo número impreso). El flujo principal es scanner; el modo manual es fallback.

**Fixes previos aplicados en la misma sesión** (antes de arrancar Etapa 4):
- Tintorerías: removido form de creación del admin (solo devs las crean vía SQL)
- Timeout Gemini: 45s con `Promise.race`, error `FORMATO_INVALIDO` si imagen no es planilla (0 rollos extraídos)
- Edición de artículos: `updateArticulo()` + `EditArticuloRow` con inline editing
- Ventas dashboard: cards con badge "Etapa 5/6" y opacidad, aviso de próximamente, botón volver para admin
- `BackButton` global: componente `src/components/BackButton.tsx` reemplaza todos los "← Volver" hardcodeados

---

### Etapa 5 — Vista de stock con filtros

**Objetivo**: cualquier rol logueado puede browsear el stock disponible, filtrar por artículo/color/ubicación, ver fotos.

**Pasos**:
1. **Decisión de ruta**: idealmente `/stock` accesible para los 3 roles, layout adaptado por rol. O 3 rutas idénticas en contenido (`/operario/stock`, `/ventas/stock`, `/admin/stock`). **Recomendación**: ruta única `/stock` con guard que la permite a operario+ventas+admin (no super).
2. **Filtros laterales (sidebar) o arriba**:
   - Artículo (dropdown con los artículos de la empresa).
   - Color (texto libre).
   - Tintorería/partida (dropdown).
   - Ubicación (texto).
   - Estado (default: solo `en_stock`; filtros opcionales para `reservado`, `entregado`, `baja`).
   - Búsqueda por número de pieza (input arriba).
3. **Vista responsive**:
   - Desktop: tabla con columnas: foto thumbnail, número de pieza, artículo, color, kilos, metros, ubicación, estado.
   - Mobile: cards apilados con la info importante.
4. **Resumen agregado** arriba de la tabla:
   - Total kilos en stock.
   - Top 5 combinaciones artículo+color por kilos.
5. **Click en un rollo** → modal de detalle:
   - Foto grande (si tiene).
   - Toda la metadata (kilos propios vs proveedor, ubicación, despacho de origen, etc.).
   - Acciones según rol:
     - Operario/admin: "Mover" (cambiar ubicación).
     - Admin: "Dar de baja".
6. **Fotos de los rollos**: si en Etapa 3/4 implementamos upload de fotos, mostrarlas. Si no, placeholder con iniciales del color.

**Archivos nuevos**:
- `src/app/stock/page.tsx` (server component, fetcha rollos con filtros)
- `src/app/stock/StockFilters.tsx` (Client component)
- `src/app/stock/RolloDetail.tsx` (modal Client component)
- `src/app/stock/layout.tsx` (guard de acceso)

**Verificable**: con 20+ rollos cargados y confirmados, filtrar por color "Negro" y ver solo los negros, click en uno, abrir el detalle, mover de ubicación.

**Tiempo estimado**: 2-3 horas.

---

### Etapa 6 — Pedidos y picking

**Objetivo**: ventas crea pedidos seleccionando rollos específicos del stock; operario hace el picking en mobile.

**Pasos**:

**A) Creación del pedido (ventas)**:
1. **Pantalla `/ventas/pedidos/nuevo`**:
   - Header: cliente (texto o autocomplete), número de remito externo (Softland u otro), fecha.
   - Tabla "carrito" de rollos seleccionados: pieza, artículo, color, kilos, X para sacar.
   - Búsqueda de rollos disponibles abajo (mismos filtros que la vista de stock).
   - Click en un rollo del listado lo agrega al carrito.
   - Suma de kilos del carrito en vivo.
   - Submit → `createPedido()`.
2. **Server action `createPedido`**:
   - Validaciones: cliente requerido, al menos 1 rollo.
   - INSERT en `pedidos` (estado=`pendiente`).
   - INSERT batch en `pedido_rollos`.
   - UPDATE batch: `rollos.estado = 'reservado'` para los rollos seleccionados.
   - Idealmente todo atómico (Postgres function/RPC) o sequential con cleanup en caso de error.
3. **Pantalla `/ventas/pedidos`** (lista):
   - Filtros por estado, cliente.
   - Tabla con cliente, kilos totales, estado, fecha.
4. **Pantalla `/ventas/pedidos/[id]`** (detalle):
   - Datos del pedido + lista de rollos asignados.
   - Acciones según estado:
     - `pendiente` o `en_preparacion`: editar (agregar/sacar rollos), cancelar.
     - `lista`: solo ver, esperando que admin marque como entregada.
     - `entregada` / `cancelada`: solo lectura.
5. **Cancelar pedido**: cambia estado a `cancelada` + libera rollos a `en_stock`.

**B) Picking (operario)**:
6. **Pantalla `/operario/picking`** (lista):
   - Pedidos en estado `pendiente` o `en_preparacion` (solo los que necesitan trabajo).
7. **Pantalla `/operario/picking/[pedido_id]`**:
   - Lista de rollos a juntar, con su ubicación.
   - Modo scanner para confirmar cada rollo (similar a Etapa 4).
   - Validación dura: si escaneás un rollo que NO pertenece al pedido → error "Este rollo no es del pedido".
   - Si escaneás uno repetido → error.
   - No se puede cerrar si faltan rollos por escanear.
8. **Cuando todos confirmados**: pedido pasa a `lista`. Notif al admin/ventas (en Etapa 7 los toasts globales se ocupan).

**C) Despachar (admin)**:
9. **Acción "Marcar como despachada"** desde el detalle (solo admin):
   - Pedido pasa a `entregada`.
   - Rollos pasan a `entregado`.
10. **Acción "Cancelar"** (admin o ventas):
    - Si pedido en `pendiente`/`en_preparacion`/`lista`, libera rollos a `en_stock`.

**Archivos nuevos**:
- `src/app/ventas/pedidos/page.tsx` (lista)
- `src/app/ventas/pedidos/nuevo/page.tsx`, `NuevoPedidoForm.tsx`, `actions.ts`
- `src/app/ventas/pedidos/[id]/page.tsx`
- `src/app/operario/picking/page.tsx` (lista)
- `src/app/operario/picking/[id]/page.tsx`, `PickingScanner.tsx`, `actions.ts`

**Verificable**: ventas crea un pedido con 3 rollos para "Cliente Test", queda en `pendiente`. Operario va a picking, intenta escanear un rollo equivocado y la app bloquea, escanea los 3 correctos, queda `lista`. Admin entra al detalle y marca como `entregada`. Stock disponible disminuye.

**Tiempo estimado**: 4-5 horas.

---

### Etapa 7 — Muestras, reportes, rediseño completo

Es la más larga. Se divide en 4 sub-bloques.

#### 7A — Módulo muestras

1. **Migración 007**: crear tabla `muestras`:
   ```
   id, empresa_id, rollo_id, cliente, kilos_descontados, motivo, vinculado_a_pedido_id (nullable), created_by, created_at
   ```
2. **Pantalla `/operario/muestras/nuevo`**: form para registrar muestra.
3. **Server action**: registra la muestra Y descuenta kilos del rollo (`UPDATE rollos SET kilos = kilos - X`).
4. **Pantalla `/operario/muestras`** (listado).
5. **Reporte muestras**: muestras del mes, qué clientes, kilos totales regalados, cuántas se vincularon a pedidos.

#### 7B — Reportes (admin/dueño)

6. **Pantalla `/admin/reportes`**.
7. Reportes:
   - Stock total por artículo+color (cantidad de rollos + kilos).
   - Movimientos del mes: ingresos (rollos nuevos en `en_stock`) vs egresos (rollos a `entregado`).
   - Diferencias proveedor vs propio (cuando hay datos en `kilos_propios`, `metros_propios`).
   - Antigüedad del stock: rollos con más de N días sin moverse (configurable).
8. Cada reporte: filtros de fecha + botón "Exportar a CSV".

#### 7C — Rediseño UI/UX completo

9. **Sidebar de navegación** lateral en desktop, drawer hamburger en mobile. Todas las secciones del rol agrupadas.
10. **Sistema de toasts**: instalar `sonner`, reemplazar banners verdes/rojos puntuales con toasts globales consistentes.
11. **Confirmation dialogs** para acciones destructivas (eliminar empresa, dar de baja rollo, cancelar pedido). Usar shadcn `Dialog`.
12. **Loading skeletons** en pantallas que tardan (lista de stock con muchos items, reportes).
13. **Empty states**: ilustración + CTA cuando una lista está vacía (en vez de solo texto "Sin items").
14. **Iconos `lucide-react`**: en sidebar, botones, headers.
15. **Mobile responsive**: convertir todas las tablas (despachos, stock, pedidos) en cards apilados en mobile (vista compacta).
16. **Componentes shadcn extra**: instalar `Card`, `Dialog`, `Sheet` (drawer), `Tabs`, `Tooltip`, `Avatar`, `Skeleton`, `Badge`.
17. **Animaciones**: micro-transitions en hover, fade-in en pantallas.
18. **Visual hierarchy**: revisar tipografía, spacing, colores en TODA la app — pase de consistencia general.

#### 7D — Polish data (rápidos)

19. **Editar/borrar artículos y tintorerías** (botones en `/admin/articulos`, `/admin/tintorerias`).
20. **Editar/borrar/pausar empresas** (botones en `/super` con confirmación dura para borrar).
21. **Middleware bloquea login si empresa.activo = false**.
22. **Editar usuarios y cambiar rol** (en `/admin/equipo`).
23. **Eliminar usuario** (admin de la empresa puede dar de baja a su equipo; super-admin puede a cualquiera).
24. **Forgot password flow**: pantalla `/auth/recover` que pide mail, llama `supabase.auth.resetPasswordForEmail()`. Supabase manda mail, link va a `/auth/setup` para nueva contraseña.
25. **🚨 Setup SMTP custom con Resend (BLOQUEANTE PARA LAUNCH)**: el built-in email de Supabase tiene un cap duro de **2 emails/hora por proyecto**, no escala con plan paid (ni Pro $25/mes ni Team $599/mes lo aumentan — está deprecado para producción). Ya nos chocamos con esto en testing: una empresa-cliente onboardeando + invitando 2-3 usuarios pega el límite. Plan: cuenta gratis en Resend (resend.com, 3.000 emails/mes free, 100/día), verificar dominio propio (idealmente comprar `stockapp.com.ar` o `stockapp.app`), cargar credenciales SMTP en Supabase → Authentication → SMTP Settings, subir rate limit en Authentication → Rate Limits a 60-100/h. Setup ~20 min. Sin esto el día del launch los emails de invitación van a fallar después de los primeros 2.
26b. **Actualizar `supabase/schema.sql` al estado canónico post-007**: hoy el archivo solo refleja Etapa 2 base. Hay que regenerar el archivo completo incluyendo migraciones 005 (multi-tenant + RLS por empresa + triggers), 006 (super-admin + CHECK constraint), 007 (color en despachos, drop codigo_externo, campos de trazabilidad). Útil para fresh installs en otras instancias o para que un colaborador nuevo arme la DB local sin tener que correr 7 migraciones en orden. **Bajo blocker** porque el desarrollo cotidiano usa la DB ya migrada.

26. **🔐 Login con username + creación manual de usuarios sin email (BLOQUEANTE PARA LAUNCH)**: cambio de modelo de auth pensado para que operarios/ventas (gente del depósito, baja afinidad técnica, sin email corporativo) entren con un username corto en vez de email completo. Además, el admin de empresa puede **crear cuentas directamente sin invitación** poniéndoles una contraseña default que el usuario cambia en el primer login.
    - **Flow nuevo de creación**: en `/admin/equipo` el form tiene dos modos: (a) "Invitar por email" (lo actual, queda para casos donde sí querés mandar mail), (b) "Agregar manualmente" → admin completa nombre + username + password default + rol → al usuario le sale flag `password_change_required = true`. Primer login lo manda a `/auth/cambiar-password` antes de seguir.
    - **Implementación de username con Supabase**: Supabase Auth está casado con email, así que se usa el patrón estándar de **email fake interno**: el username se guarda como `<username>@<empresa-slug>.stockapp.local` en `auth.users.email`, pero la UI nunca lo muestra. Login pide "Usuario" + password, el front le agrega el sufijo basado en el slug de empresa (que se elige al hacer login, dropdown o subdominio).
    - **Schema**: agregar `profiles.username` (UNIQUE composite con `empresa_id`) y `empresas.slug` (UNIQUE global, ej: "muter"). Migración 008.
    - **Decisión pendiente**: ¿admin/super también logean con username, o solo operario/ventas? Recomendación: admin/super con email (uso esporádico, gente técnica, recibe mails reales); operario/ventas con username. Pero quizás todo username queda más uniforme — definir cuando se implemente.
    - **Forgot password sin email para operario/ventas**: el admin de la empresa lo resetea desde `/admin/equipo` (botón "Resetear contraseña" → genera password temporal nuevo + flag `password_change_required`). Para admin/super sí se usa el flow de email (Resend ya estará conectado).
    - **Tiempo estimado**: 3-4 horas (incluye migración 008, refactor de login, nuevo form de creación manual, pantalla de cambio de password obligatorio, botón de reset desde admin).

**Verificable al final de Etapa 7**: app navegable, prolija, responsive en celular y desktop, lista para mostrar en defensa de tesis.

**Tiempo estimado**: 6-8 horas (es la más larga porque el rediseño UI toca todas las pantallas).

---

### Lo que NO está en el MVP (cosas mencionadas pero pospuestas)

- **Valorización del stock**: costo por rollo (hilado + licra + tintorería + merma), dashboard valorizado solo para dueño. Subsistema entero, post-MVP.
- **Control de calidad en recepción avanzado**: gramaje calculado, listado de fallas con origen (tejeduría/tintorería/materia prima), clasificación A/B/C automática. Hay campos `kilos_propios`/`metros_propios`/`ancho_propio`/`gramaje_propio` ya en el schema, pero falta el form para cargarlos y los reportes que los usen.
- **Alertas automáticas**: reserva vencida, stock viejo en crudo (>30 días para poliéster). Necesita cron job (Supabase Edge Functions o pg_cron).
- **Módulo chofer**: chofer escanea remito al entregar al cliente final. Otro rol más, fuera del flujo principal.
- **Sign-up público**: hoy solo invitation-only. Si en algún momento se quiere abrir, agregar página `/signup` + validación de email + cobro.
- **Multi-idioma**: hoy solo español. i18n con next-intl si se quiere expandir.
- **Auditoría / log de cambios**: tabla `audit_log` que registre quién hizo qué (útil para clientes con compliance).

---

## 11. Decisiones de dominio importantes

Surgidas de leer el documento de tesis con entrevistas a Mariela (experta WMS), visita a Muter, charlas con Texcom, Dakuba e ingeniera SIGE.

### Concepto clave: "aduana"

El escaneo del operario es el punto **obligatorio** de entrada y salida. Si escanea un rollo equivocado → BLOQUEAR. Si esperás 15 piezas y solo escaneó 14 → no puede cerrar. Sin esa fricción, el sistema no sirve.

### Quién es dueño del dato

El **operario** es el dueño del dato del stock. Hay que hacerle la app **muy fácil** para que la use. El depósito en Muter rota mucho (4 personas distintas en visitas) — la UX tiene que aprenderse en un día.

### Códigos de rollo

Vienen de la tintorería (no los generamos). Formatos varían (QR + Code128 + EAN). Scanner debe ser adaptable. Fallback: re-OCR de PDF → carga manual.

### Planilla de tintorería (input para Etapa 3)

Llega en papel, foto o PDF. Layout raro: **bloques paralelos de columnas** (no una tabla vertical clásica). Para la IA hay que pedirle "rollos en bloques" explícitamente, no "tabla".

### Modelo de pedidos

Ventas selecciona **rollos específicos** para cubrir un pedido. NO hay "kilos pedidos" como cantidad abstracta. El cliente pide "X kg de tal color", Belén busca y reserva los rollos puntuales. Por eso `pedido_rollos` es m2m simple, no hay tabla de "ítems".

### Estado del despacho derivado

Cuando operario carga manualmente con el toggle "ya están en el depósito", el estado del despacho se calcula desde los rollos: si todos `en_stock` → despacho `confirmado`, si alguno `pendiente` → despacho `borrador`.

---

## 12. Deploy y configuración

### Supabase
- Project URL: `https://cxspdcilrjnjblorbgzy.supabase.co`
- Region: South America (São Paulo)

### Vercel
- Region: `gru1` (São Paulo) — configurado en `vercel.json`
- Framework auto-detected (Next.js)
- Build command: default

### Variables de entorno

| Variable | Dónde | Notas |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel + .env.local | URL pública del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel + .env.local | "Publishable key" (sb_publishable_...) |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel (Production+Preview, marcado sensitive) + .env.local | service_role key. **NUNCA con prefijo NEXT_PUBLIC_**, **NUNCA commiteada** |

### GitHub
- Repo privado.
- Para que compañeros contribuyan: Settings → Collaborators → invitar por username.
- Cada compañero clona, pone su `.env.local` con las credenciales (compartidas por canal seguro), `npm install`, `npm run dev`.
- Push a `main` redeploya Vercel automático (incluso si el push lo hace un compañero — Vercel está conectado a GitHub).

### Costo
$0 actualmente. Free tiers de GitHub + Vercel + Supabase + Google AI Studio (cuando arranque Etapa 3) cubren un MVP de tesis con margen.

---

## 13. Cosas a recordar (gotchas)

1. **Todas las migraciones son idempotentes** — se pueden re-correr sin romper nada. Pero seguilas en orden.
2. **El path del proyecto es `C:\dev\stockapp-tesis`, no OneDrive**. Si el shell muestra cwd en OneDrive, está bien — solo no edites archivos del proyecto desde ahí.
3. **Cada Bash que abro resetea el PATH**. Para usar Node en bash MSYS hay que `export PATH="/c/Program Files/nodejs:$PATH"` (ya está en `~/.bashrc` pero a veces no se source-a en non-interactive).
4. **Supabase SSR + invite emails**: el template default no funciona, hay que customizarlo (ver Sección 9).
5. **TypeScript con joins de Supabase**: cuando haces `select('rollos(kilos)')`, TS lo tipa como array de un solo objeto a veces. Usar `as unknown as { ... } | null` para casts.
6. **Redirect server-side > client-side**: `router.push(?creado=1)` + `router.refresh()` perdía la query string en Next 16. Usar `redirect()` de `next/navigation` en el Server Action.
7. **Trigger `set_empresa_id`**: si un super-admin intenta INSERT en una tabla tenant-specific, el trigger setea `empresa_id = NULL` y la tabla rechaza con NOT NULL. Esto es **deliberado**: super-admin no debería contaminar datos de cliente. Si quiere actuar sobre una empresa, se loguea como admin de esa empresa.
8. **`is_super_admin()` SQL function** sigue existiendo (la usan muchas RLS), pero internamente ahora chequea `role = 'super'`.
9. **Cuentas de prueba que están dando vueltas**:
   - `admin@probando.com` (admin de Muter Textil — fake email, no recibe mails, password seteado a mano)
   - `tsilvafelgueras@itba.edu.ar` (super-admin de la plataforma — Trinidad)
10. **Email rate limit 2/h en Supabase built-in**: durante todo el desarrollo del MVP nos vamos a chocar con esto si invitamos varios usuarios seguidos. Workarounds en dev: esperar 1 hora entre tandas, usar cuentas ya creadas con password seteado a mano desde Supabase Dashboard → Authentication → Users (no requiere mail), o resetear password manualmente. El fix definitivo (Resend) está agendado en Etapa 7D punto 25 — **antes del launch sí o sí**.
11. **Activar config de tintorería en producción** (post deploy de Etapa 3): cuando creamos `src/lib/extraccion/tintorerias/{key}.ts` para una nueva tintorería, el código solo entra en juego si la fila correspondiente en la tabla `tintorerias` tiene `extraction_config_key = '{key}'`. Lo seteamos por SQL desde Supabase Dashboard. Para Muter Textil (config ya creada en `muter-textil.ts`), correr una vez por cada empresa-cliente que tenga Muter como tintorería:
    ```sql
    UPDATE tintorerias
       SET extraction_config_key = 'muter-textil'
     WHERE nombre ILIKE '%muter%';
    ```
    Si la fila tiene `extraction_config_key = NULL`, la IA usa el prompt default genérico (funciona pero menos preciso para layouts en bloques paralelos como el de Muter).

---

## 14. Cómo seguir

### Para retomar el desarrollo en otro chat

1. Pegá este documento al inicio del chat nuevo.
2. Decile al asistente la próxima etapa que querés encarar.
3. Mencioná tu working style si no está claro: "vamos por etapas chicas, propose-then-act, español argentino, sin gold-plating".

### Onboarding de un colaborador nuevo (handoff)

Cuando otra persona del equipo (compañero, futuro contributor) toma una tarea:

**Para solo testear la app deployada** (sin tocar código):
1. Acceso al deploy: https://stockapp-tesis.vercel.app
2. Cuenta de prueba: `admin@probando.com` (Trinidad pasa la pass por canal seguro)
3. Hacer hard refresh del browser después de cualquier deploy reciente (Ctrl+Shift+R en Win, Cmd+Shift+R en Mac).

**Para desarrollar localmente**:
1. Ser invitado al repo en GitHub Settings → Collaborators
2. `git clone https://github.com/tsilvafelgueras/stockapp-tesis`
3. Path local fuera de OneDrive (idealmente `C:\dev\` o equivalente Mac/Linux). Ver Sección 1 y 13 punto 2.
4. Pedirle a Trinidad el `.env.local` (canal seguro) — contiene `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`. Cada dev puede generar SU propia `GEMINI_API_KEY` gratis en https://aistudio.google.com (es preferible para tracking de quotas).
5. `npm install` (Node 24 LTS, npm 11)
6. `npm run dev` → http://localhost:3000
7. Para cambios en DB schema: las migraciones en `supabase/migrations/` se aplican manualmente en Supabase SQL Editor (ya están aplicadas las 001-008 en el proyecto compartido — solo aplicar nuevas que se agreguen).

**Para retomar contexto en chat con asistente**:
1. Pegá este documento (`docs/CONTEXTO.md`) entero al inicio del chat.
2. Mencioná qué etapa o feature querés encarar.

### Lo que viene

El detalle técnico de cada etapa está en la **Sección 10**. Etapas completadas: 0, 1, 2, multi-tenant, 3, 4. **Próxima: Etapa 5** (vista de stock con filtros — cualquier rol logueado puede browsear el stock disponible, filtrar por artículo/color/ubicación, ver fotos).
