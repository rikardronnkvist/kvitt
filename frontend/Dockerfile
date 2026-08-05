FROM node:24-alpine AS builder
ARG VITE_TAGLINE
ENV VITE_TAGLINE=${VITE_TAGLINE}
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install -g npm@12.0.2 && npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
EXPOSE 80
ENTRYPOINT ["/docker-entrypoint.sh"]
