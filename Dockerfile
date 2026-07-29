FROM node:20-alpine AS builder
WORKDIR /app
COPY backend/package.json .
RUN npm install
COPY backend/src ./src

FROM node:20-alpine
WORKDIR /app
RUN mkdir -p /app/data
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY backend/package.json .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "src/index.js"]
