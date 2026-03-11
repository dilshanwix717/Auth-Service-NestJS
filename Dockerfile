# ==============================================================================
# Multi-stage Dockerfile for Auth Service
# ==============================================================================
# Stage 1 (builder): Install all dependencies, compile TypeScript
# Stage 2 (production): Minimal Alpine image with only production deps + /dist
#
# Security:
# - Runs as non-root 'node' user (principle of least privilege)
# - Uses Alpine for minimal attack surface
# - HEALTHCHECK ensures container orchestrators can detect unhealthy instances
#
# Build: docker build -t auth-service .
# Run:   docker run -p 3001:3001 --env-file .env auth-service
# ==============================================================================

# ---------- Stage 1: Builder ----------
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first for better Docker layer caching
# (dependencies change less frequently than source code)
COPY package*.json ./

# Install ALL dependencies (including devDependencies for TypeScript compilation)
RUN npm ci

# Copy source code and config files
COPY tsconfig*.json nest-cli.json ./
COPY src/ ./src/

# Compile TypeScript to JavaScript
RUN npm run build

# Remove devDependencies after build to reduce final image size
RUN npm prune --production

# ---------- Stage 2: Production ----------
FROM node:20-alpine AS production

# Set NODE_ENV to production for optimized performance
ENV NODE_ENV=production

WORKDIR /app

# Copy only production dependencies and compiled output from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

# Security: Run as non-root user 'node' (built into node:alpine image)
# Prevents container breakout from granting root access
USER node

# Expose the application port (default: 3001)
EXPOSE 3001

# Health check: verify the service is responding
# Checks liveness endpoint every 30 seconds, fails after 3 retries
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health/live || exit 1

# Start the application
CMD ["node", "dist/main.js"]
