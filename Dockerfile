FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY server.js .
RUN mkdir -p public
COPY lp_sport.html ./public/index.html

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
