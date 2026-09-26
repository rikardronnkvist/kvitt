FROM node:24-alpine AS builder
ARG VITE_TAGLINE
ENV VITE_TAGLINE=${VITE_TAGLINE}
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build
RUN node -p "require('./package.json').version" > /app/version

FROM nginx:alpine
RUN apk upgrade --no-cache libexpat libuuid
COPY --from=builder /app/dist /usr/share/nginx/html
COPY --from=builder /app/version /app-version
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
EXPOSE 80
ENTRYPOINT ["/docker-entrypoint.sh"]
