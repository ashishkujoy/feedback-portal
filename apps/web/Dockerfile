# syntax=docker/dockerfile:1
# Build from the repo root: docker build -f apps/web/Dockerfile .
# Static build served by nginx, which also forwards /api to the api (and /otlp to a collector,
# when OTLP_UPSTREAM is set). nginx's settings are environment variables, read at start-up.

ARG NODE_IMAGE=node:24.22.0-alpine3.24
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:1.31.7-alpine3.24

# --- build: the web app's dependencies (dev included, for Vite) and `vite build` ---
FROM ${NODE_IMAGE} AS build
ARG PNPM_VERSION=12.5.1
RUN npm install --global --no-fund --no-audit pnpm@${PNPM_VERSION}
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
COPY packages/tsconfig/package.json packages/tsconfig/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @feedback-portal/web...
COPY packages/tsconfig packages/tsconfig
COPY packages/contracts/src packages/contracts/src
COPY apps/web apps/web
# Where the browser posts traces; empty builds without browser tracing.
ARG VITE_OTEL_TRACES_URL=""
ENV VITE_OTEL_TRACES_URL=${VITE_OTEL_TRACES_URL}
RUN pnpm --filter @feedback-portal/web build

# --- runtime: nginx (non-root, port 8080) with the static files ---
FROM ${NGINX_IMAGE} AS runtime
# See apps/web/nginx/default.conf.template. Cloudinary's origins (photos) and Google's (avatars).
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1 \
    OTLP_UPSTREAM="" \
    CSP_IMG_SRC="https://res.cloudinary.com https://*.googleusercontent.com" \
    CSP_CONNECT_SRC="https://api.cloudinary.com" \
    TRUSTED_PROXIES=""
COPY apps/web/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --chmod=755 apps/web/nginx/25-real-ip.sh /docker-entrypoint.d/25-real-ip.sh
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
