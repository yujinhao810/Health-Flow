FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN corepack pnpm install --frozen-lockfile

COPY apps/api apps/api
COPY packages/contracts packages/contracts
RUN corepack pnpm --filter @health/shared --filter api run build

ENV NODE_ENV=production
EXPOSE 3001
CMD ["sh", "-c", "corepack pnpm --filter api prisma:deploy && node apps/api/dist/main.js"]
