# LP SPORT v8 — backend + frontend

Sistema de pedidos con sincronización entre dispositivos. Single-user, single-password.

---

## Estructura

```
backend/
├── server.js         ← API Node.js (express + JSON file store)
├── package.json
├── Dockerfile        ← deploy en cualquier host con Docker
├── .env.example      ← variables de entorno
├── .dockerignore
├── public/
│   └── index.html    ← frontend (lp_sport_v8.jsx compilado)
└── data/             ← (creado al primer run) — backups van acá
    └── lpsport-data.json
```

## Stack

- **Backend:** Node.js 20 + Express + jsonwebtoken
- **Storage:** archivo JSON con escritura atómica (write-to-tmp + rename)
- **Auth:** una contraseña en env var → JWT cookie HttpOnly por 30 días
- **Frontend:** React 18 + Tailwind (CDN) + Babel standalone in-browser

No hay base de datos externa, no hay servicios SaaS. Todo en un contenedor.

---

## Variables de entorno

| Variable | Requerida | Default | Descripción |
|---|---|---|---|
| `APP_PASSWORD` | **Sí** | — | Tu contraseña para entrar |
| `JWT_SECRET` | **Sí** | — | String aleatorio para firmar sesiones (`openssl rand -hex 32`) |
| `PORT` | No | `3000` | Puerto a escuchar |
| `DATA_DIR` | No | `./data` | Dónde guardar el archivo JSON. En Docker es `/data` (volumen) |

---

## Probar localmente (sin Docker)

```bash
cd backend
npm install
APP_PASSWORD=test123 JWT_SECRET=$(openssl rand -hex 32) DATA_DIR=./data npm start
```

Abrir http://localhost:3000

---

## Deploy en Hostinger con easypanel

### 1 · Tener un VPS con easypanel

Si no tenés easypanel todavía:

1. En hPanel de Hostinger → tu VPS → **OS & Panel** → "Install Application"
2. Elegir el template de **easypanel** (Hostinger lo ofrece pre-armado)
3. Esperar 2-3 minutos. Vas a recibir credenciales: URL tipo `https://TU-IP:3000`

### 2 · Subir el código a GitHub

Easypanel deploya desde un repo de Git.

1. En la carpeta `backend/`, inicializar git:
   ```bash
   cd backend
   git init
   git add .
   git commit -m "lp-sport v8 initial"
   ```
2. Crear repo en GitHub (puede ser privado): https://github.com/new
3. Conectar y empujar:
   ```bash
   git remote add origin https://github.com/TU-USUARIO/lp-sport.git
   git branch -M main
   git push -u origin main
   ```

### 3 · Crear servicio en easypanel

1. Login en tu easypanel
2. **+ Create Project** → nombre: `lp-sport`
3. Dentro del proyecto: **+ Service** → tipo **"App"**
4. Pestaña **"Source"**:
   - Type: **GitHub**
   - Conectá tu cuenta de GitHub (auth con OAuth)
   - Repository: `TU-USUARIO/lp-sport`
   - Branch: `main`
5. Pestaña **"Build"**:
   - Build method: **Dockerfile** (lo detecta automático)
6. Pestaña **"Environment"** — agregar variables:
   ```
   APP_PASSWORD=tu-contraseña-fuerte
   JWT_SECRET=string-aleatorio-largo-aqui-32-chars-min
   ```
   Para generar el JWT_SECRET, podés correr en cualquier terminal:
   ```bash
   openssl rand -hex 32
   ```
7. Pestaña **"Volumes"** — agregar uno:
   - Mount path: `/data`
   - Type: **Volume** (no Bind Mount — easypanel los maneja con backups)
   - Le pone un nombre auto, ej: `lp-sport_data`
8. Pestaña **"Domains"**:
   - Add domain: `lpsport.tudominio.com` (o el subdominio que quieras)
   - **HTTPS**: ON (Let's Encrypt automático)
   - Port: **3000**

### 4 · Configurar el DNS en Hostinger

1. hPanel → Dominios → tu dominio → **DNS Zone**
2. Add new record:
   - Type: **A**
   - Name: `lpsport` (o `@` para usar el dominio raíz)
   - Points to: **IP de tu VPS** (la ves en hPanel → VPS)
   - TTL: dejar por defecto
3. Esperar 5-30 minutos a que propague

### 5 · Deploy

En easypanel: **"Deploy"**. Te muestra los logs en tiempo real:
- Clones del repo
- `docker build`
- Container starts
- Healthcheck verde

Cuando termine, abrí `https://lpsport.tudominio.com`. Te aparece la pantalla de login. Entrás con `APP_PASSWORD`.

### 6 · Backup (importante)

El archivo `data/lpsport-data.json` contiene TODOS tus pedidos. Hacé backups regulares:

**Opción A — desde la app (recomendada):**
1. Login en la app
2. Click "Exportar" en el topbar
3. Te descarga un JSON con todo

**Opción B — desde easypanel:**
1. easypanel → tu servicio → **"Files"** o conectá por SSH
2. Bajar `/data/lpsport-data.json`

**Opción C — snapshot automático:**
Easypanel maneja snapshots de volúmenes. Configurar en la pestaña "Backups" del servicio.

---

## Actualizar (deploy nueva versión)

1. Hacer cambios al código local
2. `git add . && git commit -m "..."`
3. `git push`
4. En easypanel, el servicio detecta el push (si tenés auto-deploy ON) o le das **"Deploy"** manualmente
5. ~30 segundos después está la nueva versión live

---

## Plan B — Sin VPS (hosting compartido Hostinger)

Si solo tenés hosting compartido (Premium / Business) **no podés correr Node.js**. En ese caso, perdés la sincronización entre dispositivos, pero podés servir el frontend standalone:

1. hPanel → **File Manager** → carpeta `public_html`
2. Subir el archivo `lp_sport.html` (de la raíz, no el de backend)
3. Renombrar a `index.html`
4. Listo. Está en `https://tudominio.com/`

Los datos quedan en localStorage de cada navegador (no sincroniza entre dispositivos). Funciona idéntico al modo offline/desktop.

---

## Modo standalone descargable

El archivo **`lp_sport.html`** en la raíz funciona offline en cualquier computadora. La app detecta automáticamente que no hay backend y cae a modo localStorage. Doble-click y arranca.

- Tus datos quedan en el navegador donde lo abriste
- Funciona offline
- Para mover datos a otra compu, usá "Exportar" → "Importar"

---

## Troubleshooting

**"Cannot find package 'express'":** Faltó `npm install`. Easypanel lo hace en el build del Dockerfile.

**"Sesión expirada" en bucle:** Probable que `JWT_SECRET` cambie entre restarts. Asegurate que esté seteado FIJO en env vars.

**Datos perdidos al re-deploy:** Faltó el volumen montado en `/data`. Revisar la pestaña "Volumes" en easypanel — debe haber uno mapeando a `/data`.

**HTTPS no funciona:** Esperar 5-10 minutos después de configurar el dominio. Let's Encrypt necesita validar el DNS. Si después de 15 min sigue sin emitir, revisar logs del proxy en easypanel.

**Login falla con la contraseña correcta:** Verificar que `APP_PASSWORD` no tenga espacios extras al copiar/pegar en easypanel.
