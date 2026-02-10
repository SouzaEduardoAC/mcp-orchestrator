# Stage 1: Builder
FROM node:22-alpine AS builder

WORKDIR /usr/src/app

# Install dependencies (including devDependencies for build)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Stage 2: Production
FROM node:22-alpine

WORKDIR /usr/src/app

# Install only production dependencies
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Copy built artifacts from builder
COPY --from=builder /usr/src/app/dist ./dist
COPY public ./public

# Create a non-root user (node is already created in alpine image)
# We ensure the directory is owned by node
RUN chown -R node:node /usr/src/app

USER node

EXPOSE 3000

CMD ["node", "dist/index.js"]
