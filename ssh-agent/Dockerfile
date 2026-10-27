FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json .npmrc ./
COPY packages/crypto/package.json ./packages/crypto/
COPY packages/db/package.json ./packages/db/
COPY ssh-agent/package.json ./ssh-agent/

RUN npm install --workspace=ssh-agent --include-workspace-root

COPY packages ./packages
COPY ssh-agent ./ssh-agent

RUN npm run build --workspace=@halostack/crypto
RUN npm run build --workspace=@halostack/db
RUN npm run build --workspace=ssh-agent

FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json .npmrc ./
COPY packages/crypto/package.json ./packages/crypto/
COPY packages/db/package.json ./packages/db/
COPY ssh-agent/package.json ./ssh-agent/

RUN npm install --workspace=ssh-agent --omit=dev --include-workspace-root

COPY --from=builder /app/packages/crypto/dist ./packages/crypto/dist
COPY --from=builder /app/packages/db/dist ./packages/db/dist
COPY --from=builder /app/ssh-agent/dist ./ssh-agent/dist

WORKDIR /app/ssh-agent
EXPOSE 8080 9090
CMD ["node", "dist/index.js"]
