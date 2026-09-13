# One image for the web app, the worker and the migrate step. Compose picks the
# command per service. Debian rather than Alpine so Prisma's native engine and
# openssl work without extra binary targets. Size is not a concern for a
# single-machine deployment; a build that works the first time is.
FROM node:22-bookworm-slim

ARG TYPST_VERSION=v0.15.1

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates curl xz-utils fonts-liberation \
  && rm -rf /var/lib/apt/lists/*

# Typst for PDF rendering. The musl build is static and runs on Debian as is.
RUN curl -fsSL "https://github.com/typst/typst/releases/download/${TYPST_VERSION}/typst-x86_64-unknown-linux-musl.tar.xz" \
  | tar -xJ -C /tmp \
  && mv /tmp/typst-x86_64-unknown-linux-musl/typst /usr/local/bin/typst \
  && rm -rf /tmp/typst-x86_64-unknown-linux-musl \
  && typst --version

RUN npm install -g pnpm@11.7.0

WORKDIR /app

# Manifests first so the install layer caches until a dependency changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json turbo.json ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY apps/extension/package.json apps/extension/
COPY packages/db/package.json packages/db/
COPY packages/core/package.json packages/core/
RUN pnpm install --frozen-lockfile

COPY . .

# next build needs the variable to exist; nothing connects during the build.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN pnpm --filter @shortlisted/db build \
  && pnpm --filter @shortlisted/core build \
  && pnpm --filter @shortlisted/worker build \
  && pnpm --filter @shortlisted/web build

ENV NODE_ENV=production
ENV TYPST_BIN=/usr/local/bin/typst
