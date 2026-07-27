FROM node:22.20.0-alpine3.22 AS build
WORKDIR /workspace
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci --ignore-scripts
COPY src ./src
COPY content ./content
COPY scripts ./scripts
RUN npm run build

FROM node:22.20.0-alpine3.22 AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /workspace/dist ./dist
COPY self-host/postgres ./self-host/postgres
USER node
EXPOSE 8787
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=6 \
  CMD wget --quiet --spider http://127.0.0.1:8787/health || exit 1
CMD ["node", "dist/self-host/server.js"]
