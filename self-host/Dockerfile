FROM node:22.23.1-alpine3.24 AS build
WORKDIR /workspace
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci --ignore-scripts
COPY src ./src
COPY content ./content
COPY scripts ./scripts
COPY docs/branding/concepts ./docs/branding/concepts
COPY project42.config.json ./project42.config.json
RUN npm run build

FROM node:22.23.1-alpine3.24 AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
  && npm cache clean --force \
  && rm -rf \
    /opt/yarn-* \
    /usr/local/lib/node_modules \
    /usr/local/bin/corepack \
    /usr/local/bin/npm \
    /usr/local/bin/npx \
    /usr/local/bin/yarn \
    /usr/local/bin/yarnpkg
COPY --from=build /workspace/dist ./dist
COPY self-host/postgres ./self-host/postgres
USER node
EXPOSE 8787
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=6 \
  CMD wget --quiet --spider http://127.0.0.1:8787/health || exit 1
CMD ["node", "dist/self-host/server.js"]
