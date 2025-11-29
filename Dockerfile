# ---------------------------------------------------------
# STAGE 1: Build the React Frontend
# ---------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# 1. Install dependencies (cached if package files don't change)
COPY package.json package-lock.json ./
# Note: If you have patches or local deps, copy them here too
RUN npm ci

# 2. Copy source code
COPY . .

# 3. Build the app
# This generates the static files in /app/dist
RUN npm run build

# ---------------------------------------------------------
# STAGE 2: Final Runtime Image
# ---------------------------------------------------------
FROM alpine:latest

# UPDATE TO 0.34.0 (Or latest)
ARG PB_VERSION=0.34.0

RUN apk add --no-cache \
    unzip \
    ca-certificates

# Download PocketBase
ADD https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip /tmp/pb.zip
RUN unzip /tmp/pb.zip -d /pb/

# ---------------------------------------------------------
# AUTO-CONFIGURATION
# ---------------------------------------------------------

# 1. Copy the built React app into PocketBase's public directory
# This allows PocketBase to serve your frontend.
COPY --from=builder /app/dist /pb/pb_public

# 2. Bake in the Schema & Security Logic
# We copy these into the image so the database initializes automatically on first run.
COPY ./pb_migrations /pb/pb_migrations
COPY ./pb_hooks /pb/pb_hooks

# 3. Expose the port
EXPOSE 8090

# 4. Start PocketBase
# --http=0.0.0.0:8090 binds to all interfaces (required for Docker networking)
CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090"]