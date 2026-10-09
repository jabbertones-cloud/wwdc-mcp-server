# Compile native better-sqlite3 with the official Debian build toolchain.
# The slim image lacks CA certificates and its HTTP apt mirror is blocked in Colima.
# Do not disable APT TLS verification or ship a build without a real compiler.
FROM node:22-bookworm AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm rebuild better-sqlite3

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY dist ./dist
COPY .deploy-data/wwdc.db ./data/wwdc.db
# A deterministic release fingerprint forces a normal Container rollout when
# source SHA changes but the indexed SQLite corpus and runtime code do not.
COPY .deploy-data/release.json ./data/release.json
EXPOSE 8789
CMD ["node", "dist/mcp-http.js"]
