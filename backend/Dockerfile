FROM node:24-alpine3.24 AS builder
WORKDIR /app
RUN apk add --no-cache g++
RUN apk add --no-cache make
RUN apk add --no-cache python3
COPY package-lock.json package.json ./
RUN npm ci --ignore-scripts
RUN npm_config_build_from_source=true npm rebuild better-sqlite3
COPY . .

FROM node:24-alpine3.24
WORKDIR /app
RUN apk upgrade --no-cache \
    && rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx \
    && mkdir -p /app/data
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json .
COPY --from=builder /app/package-lock.json .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "src/index.js"]
