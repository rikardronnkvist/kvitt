FROM node:24-alpine AS builder
WORKDIR /app
RUN apk add --no-cache g++
RUN apk add --no-cache make
RUN apk add --no-cache python3
COPY package-lock.json package.json ./
RUN npm ci --ignore-scripts
RUN npm_config_build_from_source=true npm rebuild better-sqlite3
COPY . .

FROM node:24-alpine
WORKDIR /app
# upgrade npm to pull in updated bundled deps (fixes Trivy CVEs in npm-internal packages)
RUN npm install -g npm@latest --no-update-notifier
RUN mkdir -p /app/data
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json .
COPY --from=builder /app/package-lock.json .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "src/index.js"]
