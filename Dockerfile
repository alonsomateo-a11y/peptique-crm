# CRM de Peptique para el servidor propio. Se compila en la Mac (o en CI), no en el servidor:
#   docker buildx build --platform linux/amd64 --build-arg NEXT_PUBLIC_SUPABASE_URL=... \
#     --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=... -t peptique-crm .
# Las variables NEXT_PUBLIC_ se fijan al compilar; las secretas se pasan al correr el contenedor.
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S crm && adduser -S crm -G crm
COPY --from=build --chown=crm:crm /app/.next/standalone ./
COPY --from=build --chown=crm:crm /app/.next/static ./.next/static
COPY --from=build --chown=crm:crm /app/public ./public
USER crm
EXPOSE 3000
CMD ["node", "server.js"]
