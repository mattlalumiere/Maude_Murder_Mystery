# syntax=docker/dockerfile:1
# Build from the repo root:  docker build -f web/Dockerfile web
# One image for every environment. No secrets are baked in: all config is environment variables.

ARG NODE_IMAGE=node:22.12-alpine3.21

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM ${NODE_IMAGE} AS runtime
RUN apk add --no-cache tini \
 && addgroup -S -g 10001 app && adduser -S -u 10001 -G app -h /nonexistent -H app \
 && mkdir -p /data && chown app:app /data
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
# public/ may be absent; the glob keeps the COPY valid either way.
COPY --from=build --chown=app:app /app/publi[c] ./public
USER 10001:10001
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/healthz || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
