# Build stage
FROM node:20-alpine AS builder

# Install build dependencies for native modules and expose python alias for node-gyp
RUN apk add --no-cache python3 make g++ \
    && ln -sf python3 /usr/bin/python

# Hint npm/node-gyp to use python3 explicitly
ENV PYTHON=/usr/bin/python3
ENV npm_config_python=/usr/bin/python3

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm i

# Copy source code
COPY . .

# Build the Next.js application
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

# Copy necessary files from builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/app ./app

# Set environment to production
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
