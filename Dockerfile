# Works on Railway, Fly.io, or any Docker host.
FROM node:22-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY server/package*.json server/
COPY client/package*.json client/
RUN npm ci --prefix server --omit=dev && npm ci --prefix client
COPY . .
RUN npm run build --prefix client && rm -rf client/node_modules

FROM node:22-slim
WORKDIR /app
ENV PORT=8080 DB_FILE=/data/stocksense.db
COPY --from=build /app /app
RUN mkdir -p /data
EXPOSE 8080
CMD ["node", "server/src/start.js"]
