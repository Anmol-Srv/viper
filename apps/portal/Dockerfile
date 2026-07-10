# Viper portal (SPEC §4.1). The portal shells out to `docker build`/`docker push` on the HOST's
# dockerd (see lib/build.ts) — it does not run its own Docker-in-Docker. When containerized this
# REQUIRES:
#   -v /var/run/docker.sock:/var/run/docker.sock   (host socket mount — the one privileged piece)
#   -e DOCKER_CONTEXT=default                       (talk to the mounted socket directly, not
#                                                     the colima-coolify context used in local dev)
# Also mount volumes for state that must survive redeploys and isn't baked into the image:
#   - ./data   → /app/data     (projects.json)
#   - ./output → /app/output   (generated zips, re-downloadable from the detail page)
#   - the template/ dir the zip-gen reads from (VIPER_TEMPLATE_DIR env, defaults to ../../template
#     — point it at a path that exists inside this container, e.g. a bind-mounted copy)

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# docker CLI only — no daemon here, it talks to the mounted host socket (see header comment).
RUN apk add --no-cache docker-cli

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

ENV PORT=3400
ENV HOSTNAME=0.0.0.0
EXPOSE 3400
CMD ["node", "server.js"]
