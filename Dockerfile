# The full (non-slim) Node image already includes OpenSSL, which Prisma needs,
# so the build doesn't depend on apt mirrors being reachable.

# ---- Build ----
FROM node:22-bookworm AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev && cd apps/api && npx prisma generate

# ---- Run ----
FROM node:22-bookworm
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/package.json ./apps/api/
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist
WORKDIR /app/apps/api
EXPOSE 3000
USER node
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
