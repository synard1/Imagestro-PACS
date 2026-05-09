FROM oven/bun:1
WORKDIR /app

# Copy manifest terlebih dulu agar cache bun install bisa ke-reuse
COPY package.json ./
# Jika nanti kamu punya bun.lockb, tinggal un-comment baris di bawah:
# COPY bun.lockb ./

RUN bun install --no-progress

# Baru copy source
COPY src ./src

ENV NODE_ENV=production
EXPOSE 8180
CMD ["bun", "src/server.ts"]
