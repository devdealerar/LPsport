# LP Sport — production image
# Single-stage build (pure JS deps, no native compilation needed).
FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY server.js .
COPY public/ ./public/

ENV PORT=3000
ENV DATA_DIR=/data
EXPOSE 3000
VOLUME ["/data"]

# APP_PASSWORD and JWT_SECRET must be supplied at runtime via env.
CMD ["node", "server.js"]
