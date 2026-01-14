FROM node:20-alpine

WORKDIR /app

# Enable pnpm via corepack
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install dependencies first (no lockfile assumed)
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile=false

# Copy source and config
COPY tsconfig.json ./
COPY src ./src
COPY dataset ./dataset

# Optional build step (runs only if the script exists)
RUN pnpm run --if-present build

CMD ["pnpm", "start"]
