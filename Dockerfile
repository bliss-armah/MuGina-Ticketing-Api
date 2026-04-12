# ─── Base ─────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app

# Prisma + native deps stability
RUN apk add --no-cache openssl curl


# ─── Dependencies ─────────────────────────────────────────────────────────────
FROM base AS deps

COPY package.json yarn.lock ./
COPY prisma ./prisma

RUN yarn install --frozen-lockfile --force

# Generate Prisma client AFTER install (IMPORTANT)
RUN yarn prisma:generate


# ─── Builder ──────────────────────────────────────────────────────────────────
FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN yarn build


# ─── Development (hot-reload) ─────────────────────────────────────────────────
FROM base AS development

COPY --from=deps /app/node_modules ./node_modules
COPY . .

EXPOSE 3050

CMD ["sh", "-c", "yarn prisma:generate && yarn start:dev"]


# ─── Production ───────────────────────────────────────────────────────────────
FROM base AS production

WORKDIR /app
ENV NODE_ENV=production

COPY package.json yarn.lock ./
COPY prisma ./prisma

# install only production deps
RUN yarn install --production --frozen-lockfile

# IMPORTANT: generate Prisma in runtime environment
RUN yarn prisma:generate

# app build output
COPY --from=builder /app/dist ./dist

EXPOSE 3050

# run migrations then start app
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]