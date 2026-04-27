FROM node:20-alpine
ARG INSTALL_CHAOS_TOOLS=false
RUN apk add --no-cache su-exec \
  && if [ "$INSTALL_CHAOS_TOOLS" = "true" ]; then apk add --no-cache docker-cli postgresql-client; fi
WORKDIR /app
COPY monitoring/demo/package.json monitoring/demo/package-lock.json ./
RUN npm ci --omit=dev
COPY monitoring/demo/prisma ./prisma
RUN npx prisma generate
COPY monitoring/demo/server.js ./
COPY monitoring/demo/public ./public
COPY monitoring/demo/prisma-client.js ./
COPY monitoring/demo/docker-entrypoint.sh /usr/local/bin/
COPY monitoring/scenario-runner ./monitoring/scenario-runner
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
EXPOSE 8080
ENTRYPOINT ["docker-entrypoint.sh"]
