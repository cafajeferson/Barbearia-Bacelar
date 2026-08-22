# Build multi-stage: deps -> builder -> runner. Produz uma imagem final
# pequena rodando só o output "standalone" do Next.js (server.js
# autocontido) — sem o node_modules completo, sem devDependencies.

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Client do Prisma 7 é gerado em src/generated/prisma (não é o padrão
# prisma-client-js) — precisa existir antes do `next build`, que faz
# type-check e bundling contra ele.
RUN npx prisma generate
# NEXT_PUBLIC_* e outras envs necessárias em build-time (não segredos de
# runtime) entram aqui via --build-arg no docker-compose/CI.
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
