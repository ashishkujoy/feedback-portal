# syntax=docker/dockerfile:1
# Build from the repo root: docker build -f e2e/Dockerfile .
# Playwright's image, whose browsers match the @playwright/test version in e2e/package.json.

FROM mcr.microsoft.com/playwright:v1.64.1-noble
ARG PNPM_VERSION=12.5.1
RUN npm install --global --no-fund --no-audit pnpm@${PNPM_VERSION}
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/tsconfig packages/tsconfig
COPY e2e/package.json e2e/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @feedback-portal/e2e...
COPY e2e/playwright.config.ts e2e/tsconfig.json e2e/
COPY e2e/tests e2e/tests
WORKDIR /app/e2e
CMD ["pnpm", "exec", "playwright", "test"]
