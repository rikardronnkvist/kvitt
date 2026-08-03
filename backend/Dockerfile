FROM node:24-alpine AS builder
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .

FROM node:24-alpine
WORKDIR /app
RUN mkdir -p /app/data
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "src/index.js"]
