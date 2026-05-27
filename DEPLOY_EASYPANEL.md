# Deploy LP Sport en Easypanel con PostgreSQL

Proyecto Easypanel con **dos servicios**: PostgreSQL + App (LP Sport).

---

## Parte 1 — PostgreSQL

1. Entrá a Easypanel → **Create Project** → nombre: `lp-sport` (o el que uses).
2. **+ Service** → elegí **PostgreSQL** (o **Database → PostgreSQL** según tu versión de Easypanel).
3. Configurá:
   - **Name / Service name:** `postgres` (importante: la app usará este hostname)
   - **Database:** `lpsport`
   - **User:** `lpsport`
   - **Password:** generá una contraseña fuerte y **guardala**
   - **Version:** 16 (o la LTS disponible)
4. **Deploy** y esperá estado **Running** (verde).
5. Anotá la connection string interna. En Easypanel suele verse en **Credentials** o **Connection**:
   ```
   postgres://lpsport:TU_PASSWORD@postgres:5432/lpsport
   ```
   - Host `postgres` = nombre del servicio dentro del mismo proyecto (no `localhost`).
   - Puerto `5432` = puerto interno del contenedor.

### Backup del volumen Postgres (recomendado)

En el servicio PostgreSQL → pestaña **Volumes** / **Backups** → activá snapshots o backup programado. Ahí viven usuarios y todos los pedidos (`kv_store`).

---

## Parte 2 — App LP Sport (GitHub + Docker)

1. Subí este repo a GitHub (si aún no está):
   ```bash
   git add .
   git commit -m "LP Sport v8 PostgreSQL multi-usuario"
   git push
   ```
2. En el **mismo proyecto** Easypanel → **+ Service** → **App**.
3. **Source:**
   - Type: **GitHub**
   - Repo: `devdealerar/LPsport` (o el tuyo)
   - Branch: `main`
4. **Build:**
   - Method: **Dockerfile** (detecta el `Dockerfile` en la raíz)
5. **Environment** — variables obligatorias:

   | Variable | Valor ejemplo |
   |---|---|
   | `DATABASE_URL` | `postgres://lpsport:TU_PASSWORD@postgres:5432/lpsport` |
   | `JWT_SECRET` | string de 32+ chars aleatorios |
   | `ADMIN_USERNAME` | `admin` |
   | `ADMIN_PASSWORD` | contraseña fuerte del primer admin |
   | `PORT` | `3000` |

   Generar `JWT_SECRET` (en tu PC):
   ```bash
   openssl rand -hex 32
   ```

   Si Postgres está en otro proveedor con SSL (Neon, Supabase, etc.):
   ```
   DATABASE_SSL=true
   ```

6. **Domains:**
   - Agregá dominio: `lpsport.tudominio.com`
   - HTTPS: **ON**
   - Puerto de la app: **3000**
7. **Deploy** y mirá los logs. Debe aparecer:
   ```
   [lp-sport] Database ready
   [lp-sport] Admin user created: admin   ← solo la primera vez
   [lp-sport] Listening on http://localhost:3000
   ```

---

## Parte 3 — DNS (Hostinger u otro)

1. Panel DNS del dominio → registro **A**
2. **Name:** `lpsport`
3. **Points to:** IP pública del VPS de Easypanel
4. Esperá 5–30 minutos de propagación.

---

## Parte 4 — Verificar

1. Abrí `https://lpsport.tudominio.com/api/health`  
   Respuesta esperada: `{"ok":true,"db":true,"time":...}`
2. Abrí la app → login con `ADMIN_USERNAME` / `ADMIN_PASSWORD`.
3. Como admin → menú lateral **Usuarios** → creá cuentas empleado.

---

## Actualizar la app

1. `git push` al repo
2. Easypanel → servicio App → **Deploy** (o auto-deploy si está activo)
3. **No hace falta** redeploy de Postgres salvo cambios de credenciales

---

## Errores frecuentes

| Síntoma | Causa | Solución |
|---|---|---|
| `Database init failed` | `DATABASE_URL` mal o Postgres apagado | Mismo proyecto, host `postgres`, servicio DB verde |
| `ECONNREFUSED` | Host incorrecto | No uses `localhost` en la app Docker |
| Health `db: false` | Credenciales o DB name incorrectos | Copiá la URL desde Credentials de Easypanel |
| Login solo pide contraseña | Versión vieja desplegada | Redeploy desde este repo |
| Admin no se crea | Falta `ADMIN_PASSWORD` en primer deploy | Seteala y redeploy una vez |

---

## Orden de arranque

1. Deploy **PostgreSQL** primero y esperá que esté healthy.
2. Deploy **App** después con `DATABASE_URL` apuntando al servicio `postgres`.

Si la app arranca antes que Postgres, reiniciá el servicio App una vez que la DB esté lista.
