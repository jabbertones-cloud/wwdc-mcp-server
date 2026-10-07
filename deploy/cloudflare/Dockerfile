FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY dist ./dist
COPY .deploy-data/wwdc.db ./data/wwdc.db
EXPOSE 8789
CMD ["node", "dist/mcp-http.js"]
