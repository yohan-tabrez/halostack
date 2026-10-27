FROM node:20-slim AS builder
WORKDIR /app

# Copy workspace manifests only — install fresh inside Linux to get correct native bindings
COPY package.json .npmrc ./
COPY packages/crypto/package.json ./packages/crypto/
COPY packages/db/package.json ./packages/db/
COPY web/package.json ./web/

RUN npm install --workspace=web --include-workspace-root

COPY packages ./packages
COPY web ./web

# Ensure Tailwind/lightningcss native modules are present (npm optional-deps bug with cross-platform lockfiles)
RUN npm install \
    @tailwindcss/oxide-linux-x64-gnu \
    lightningcss-linux-x64-gnu \
    --workspace=web --include-workspace-root

RUN npm run build --workspace=@halostack/crypto
RUN npm run build --workspace=@halostack/db
RUN npm run build --workspace=web

FROM node:20-slim
WORKDIR /app

ENV NODE_ENV=production

# Standalone bundle includes traced runtime deps — no npm install or next.config.ts at startup
COPY --from=builder /app/web/.next/standalone ./
COPY --from=builder /app/web/.next/static ./web/.next/static
COPY --from=builder /app/web/public ./web/public

EXPOSE 3000
CMD ["node", "web/server.js"]
