FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package.json tsconfig.json package-lock.json* ./
RUN npm install --production=false

# Copy source
COPY src ./src
COPY test ./test
COPY jest.config.cjs ./jest.config.cjs

RUN npm run build

# Use non-root user
RUN addgroup -S app && adduser -S app -G app
USER app

EXPOSE 5001

CMD ["node", "dist/app.js"]
