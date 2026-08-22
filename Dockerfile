# Build multi-stage: deps -> builder -> runner. Produz uma imagem final
# pequena rodando só o output "standalone" do Next.js (server.js
# autocontido) — sem o node_modules completo, sem devDependencies.
#
# Node 22, não 20: @supabase/realtime-js, @supabase/storage-js e
# @supabase/supabase-js exigem node >=22 (engines). slim (Debian/glibc) em
# vez de alpine só por preferência, não é causa de nada aqui (testado nas
# duas).

FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-slim AS builder
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

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
