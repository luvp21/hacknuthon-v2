# ── Builder stage ──────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production=false

# Copy source and compile
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Remove dev dependencies
RUN npm prune --production

# ── Production stage ───────────────────────────────────────────
FROM node:20-alpine AS production

LABEL maintainer="hackamined"
LABEL description="AI Voice Ordering Copilot for Restaurants"

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S appuser -u 1001 -G nodejs

WORKDIR /app

# Copy built artifacts and production node_modules
COPY --from=builder --chown=appuser:nodejs /app/dist ./dist
COPY --from=builder --chown=appuser:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:nodejs /app/package.json ./

# Switch to non-root user
USER appuser

EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/server.js"]
