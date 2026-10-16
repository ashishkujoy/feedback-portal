# syntax=docker/dockerfile:1
# Build from the repo root: docker build -f apps/api/Dockerfile .
# The image keeps the pnpm workspace layout: Node won't strip types from .ts files
# inside node_modules, so workspace packages must stay symlinks to /app/packages.

ARG NODE_IMAGE=node:24.22.0-alpine3.24

# --- deps: production dependencies only, installed with pnpm ---
FROM ${NODE_IMAGE} AS deps
ARG PNPM_VERSION=12.5.1
RUN npm install --global --no-fund --no-audit pnpm@${PNPM_VERSION}
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY packages/contracts/package.json packages/contracts/
COPY packages/tsconfig/package.json packages/tsconfig/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter @feedback-portal/api...

# --- runtime: node + prod node_modules + source; no pnpm ---
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps --chown=node:node /app/node_modules node_modules
COPY --from=deps --chown=node:node /app/apps/api/node_modules apps/api/node_modules
COPY --from=deps --chown=node:node /app/packages/contracts/node_modules packages/contracts/node_modules
COPY --chown=node:node packages/contracts/package.json packages/contracts/
COPY --chown=node:node packages/contracts/src packages/contracts/src
COPY --chown=node:node apps/api/package.json apps/api/
COPY --chown=node:node apps/api/drizzle apps/api/drizzle
COPY --chown=node:node apps/api/src apps/api/src
USER node
WORKDIR /app/apps/api
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT:-3000}/health" || exit 1
CMD ["node", "src/main.ts"]
