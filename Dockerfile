# API Server Dockerfile for Cloud Run
FROM node:20

WORKDIR /app

# Install system dependencies for canvas
RUN apt-get update && apt-get install -y \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including dev for tsx)
RUN npm ci

# Copy source code
COPY . .

# Expose port (Cloud Run uses PORT env var)
EXPOSE 8080

# Set environment variable for Cloud Run
ENV PORT=8080
ENV NODE_ENV=production

# Start the API server using tsx
CMD ["npx", "tsx", "src/server/api.ts"]
