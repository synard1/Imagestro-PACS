# Bun-based SATUSEHAT Integrator Service
FROM oven/bun:latest

WORKDIR /app

# Set production env
ENV NODE_ENV=production

# Copy package manifest first for caching
COPY package.json bun.lockb* ./

# Install deps (none heavy; Bun handles fetch natively)
RUN bun install --ci

# Copy source
COPY src ./src

# Expose internal port
EXPOSE 8081

# Run service
CMD ["bun", "run", "src/index.ts"]