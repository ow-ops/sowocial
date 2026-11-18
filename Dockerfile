FROM node:24-bookworm-slim AS build
ENV CI=1 EXPO_NO_TELEMETRY=1
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
COPY modules ./modules
RUN pnpm install --frozen-lockfile
COPY . .
RUN npx expo export -p web

FROM caddy:2.11-alpine AS caddy

FROM alpine:3.24
RUN adduser -D -u 10001 -h /nonexistent -s /sbin/nologin app
COPY --from=caddy /usr/bin/caddy /usr/bin/caddy
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
ENV XDG_DATA_HOME=/tmp XDG_CONFIG_HOME=/tmp
USER 10001
EXPOSE 8080
HEALTHCHECK CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
ENTRYPOINT ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
