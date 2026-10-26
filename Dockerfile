FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends zip && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY src ./src
COPY scripts ./scripts
COPY tsconfig.json ./
COPY migrations ./migrations
COPY public ./public
COPY extension ./extension
COPY legacy-public ./legacy-public
RUN npm run build

FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY cloud/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist/cloud ./dist/cloud
COPY extension/manifest.json ./extension/manifest.json
COPY migrations ./migrations
USER node
CMD ["sh", "-c", "node dist/cloud/${PLOT_PROCESS:-server}.js"]
