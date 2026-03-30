FROM node:20-alpine
RUN apk add --no-cache su-exec
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
EXPOSE 8080
ENTRYPOINT ["docker-entrypoint.sh"]
