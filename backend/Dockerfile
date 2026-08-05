FROM node:24-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

FROM node:24-alpine
WORKDIR /app
RUN mkdir -p /app/data
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json .
COPY --from=builder /app/package-lock.json .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "src/index.js"]
