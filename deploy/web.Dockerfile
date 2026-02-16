# ----------------------------
# Build the Vite/React frontend
# ----------------------------
FROM node:22-alpine AS build
WORKDIR /app

# Install dependencies first for better Docker caching
COPY frontend/package.json ./
COPY frontend/package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Copy the rest of the frontend source
COPY frontend/ ./

# Build static assets
RUN npm run build


# ----------------------------
# Runtime: Caddy serves static assets + reverse proxies the API
# ----------------------------
FROM caddy:2-alpine

COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
