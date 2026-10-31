# --- Build ---
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- Laufzeit: kleiner Node-Server (App + API für Battle & Sync), keine Abhängigkeiten ---
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=80 STATIC_DIR=/app/dist DATA_DIR=/data
COPY --from=build /app/dist ./dist
COPY server/server.mjs ./server.mjs
VOLUME /data
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/api/health >/dev/null || exit 1
CMD ["node", "server.mjs"]
