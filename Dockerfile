# LP Sport — production image
FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY server.js .
# Usar lp_sport.html como frontend principal
RUN mkdir -p public
COPY lp_sport.html ./public/index.html

ENV PORT=3000
EXPOSE 3000

# DATABASE_URL, JWT_SECRET, ADMIN_PASSWORD deben setearse en EasyPanel env vars.
CMD ["node", "server.js"]
