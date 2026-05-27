# LP SPORT v8 — backend + frontend

Sistema de pedidos con sincronización entre dispositivos, usuarios y roles (admin / empleado).

---

## Estructura

```
├── server.js           ← API Node.js (Express + PostgreSQL)
├── package.json
├── Dockerfile
├── .env.example
├── lp_sport.html       ← frontend (fuente principal)
├── lp_sport_v8.jsx     ← misma app, para editar en JSX
└── public/
    └── index.html      ← copia servida por el servidor en producción
```

## Stack

- **Backend:** Node.js 20 + Express + PostgreSQL (`pg`) + bcrypt
- **Auth:** usuario + contraseña → JWT en cookie HttpOnly (30 días)
- **Datos:** tabla `kv_store` (pedidos, diseños, empresas como JSON)
- **Frontend:** React 18 + Tailwind (CDN) + Babel in-browser

---

## Variables de entorno

| Variable | Requerida | Descripción |
|---|---|---|
| `DATABASE_URL` | **Sí** | `postgres://user:pass@host:5432/db` |
| `JWT_SECRET` | **Sí** | String aleatorio (`openssl rand -hex 32`) |
| `ADMIN_PASSWORD` | **Sí** (1.er arranque) | Contraseña del admin inicial si la DB está vacía |
| `ADMIN_USERNAME` | No | Usuario admin inicial (default: `admin`) |
| `DATABASE_SSL` | No | `true` si el host Postgres exige SSL |
| `PORT` | No | Default `3000` |

---

## Probar localmente

Necesitás PostgreSQL corriendo (local o Docker):

```bash
docker run -d --name lpsport-pg -e POSTGRES_USER=lpsport -e POSTGRES_PASSWORD=secret -e POSTGRES_DB=lpsport -p 5432:5432 postgres:16-alpine
```

```bash
npm install
set DATABASE_URL=postgres://lpsport:secret@localhost:5432/lpsport
set JWT_SECRET=tu-secreto-largo
set ADMIN_PASSWORD=admin123
npm start
```

Abrir http://localhost:3000 — login: `admin` / `admin123`

---

## Deploy en Easypanel (PostgreSQL + App)

Guía paso a paso abajo. Resumen: **2 servicios** en el mismo proyecto Easypanel — PostgreSQL y la app LP Sport.

---

## Modo standalone (sin servidor)

El archivo `lp_sport.html` funciona offline con localStorage si no hay backend. Sin sincronización ni usuarios.

---

## Troubleshooting

**`Database init failed`:** `DATABASE_URL` incorrecta o Postgres no alcanzable. En Easypanel usá el hostname **interno** del servicio (ej. `postgres`), no `localhost`.

**Login en bucle:** `JWT_SECRET` debe ser fijo entre reinicios.

**503 en `/api/health`:** la app no conecta a PostgreSQL — revisar `DATABASE_URL` y que el servicio Postgres esté verde.

**Solo contraseña en login:** estás en la versión vieja (JSON). Restaurá esta versión con usuario + contraseña.
