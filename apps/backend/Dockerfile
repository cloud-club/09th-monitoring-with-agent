FROM node:20-alpine AS builder

WORKDIR /app

COPY apps/backend/package.json apps/backend/package-lock.json ./
COPY apps/backend/prisma ./prisma

RUN npm ci

COPY apps/backend/tsconfig.json ./
COPY apps/backend/tsconfig.build.json ./
COPY apps/backend/src ./src

RUN npm run build
RUN npm prune --omit=dev

FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

EXPOSE 8080

CMD ["node", "dist/main.js"]
