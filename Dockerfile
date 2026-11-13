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
# TARGETARCH is set by BuildKit: amd64 on Intel and AMD, arm64 on Apple Silicon.
ARG TARGETARCH
RUN case "${TARGETARCH}" in arm64) TYPST_ARCH=aarch64 ;; *) TYPST_ARCH=x86_64 ;; esac \
  && curl -fsSL "https://github.com/typst/typst/releases/download/${TYPST_VERSION}/typst-${TYPST_ARCH}-unknown-linux-musl.tar.xz" \
  | tar -xJ -C /tmp \
  && mv "/tmp/typst-${TYPST_ARCH}-unknown-linux-musl/typst" /usr/local/bin/typst \
  && rm -rf "/tmp/typst-${TYPST_ARCH}-unknown-linux-musl" \
  && typst --version

RUN npm install -g pnpm@11.7.0

# The two command line tools behind the claude-cli and codex-cli providers.
# Each person signs in once with their own subscription; the login lives in the
# cli_auth volume mounted at /cli, never in the image.
ARG CLAUDE_CODE_VERSION=2.1.317
ARG CODEX_VERSION=0.167.1
RUN npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION} @openai/codex@${CODEX_VERSION} \
  && mkdir -p /cli/claude /cli/codex \
  && claude --version && codex --version
ENV CLAUDE_CONFIG_DIR=/cli/claude
ENV CODEX_HOME=/cli/codex
ENV DISABLE_UPDATES=1

WORKDIR /app

# Manifests first so the install layer caches until a dependency changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json turbo.json ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY apps/extension/package.json apps/extension/
COPY packages/db/package.json packages/db/
COPY packages/core/package.json packages/core/
COPY packages/feed/package.json packages/feed/
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
# Tells the setup page that the sign-in commands need the Compose prefix.
ENV SHORTLISTED_DOCKER=1
# The release workflow passes the tag. Set last so it never invalidates the build layers.
ARG SHORTLISTED_VERSION=dev
ENV SHORTLISTED_VERSION=${SHORTLISTED_VERSION}
