# Viper auth service. SQLite file lives at AUTH_DB (default ./auth.db) — mount a volume and
# set AUTH_DB=/data/auth.db in Coolify so the DB survives redeploys.
FROM node:20-alpine
# ponytail: better-sqlite3 ships musl prebuilds for node:20-alpine (arm64+x64) — no build
# toolchain needed. If `npm ci` ever falls back to source compile here, add before it:
#   RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js ./
EXPOSE 4000
CMD ["node", "server.js"]
