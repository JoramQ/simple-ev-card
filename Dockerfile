FROM node:20-alpine
WORKDIR /app

# Copy package files first (for layer caching)
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source files
COPY . .

# Default: run full build (lint + rollup)
CMD ["npm", "run", "build"]

# Usage:
#   Build image:
#     docker build -t ev-card-builder .
#
#   Run build (output in dist/):
#     docker run --rm -v "$PWD/dist":/app/dist ev-card-builder
#
#   Run lint only:
#     docker run --rm ev-card-builder npm run lint
#
#   Interactive shell:
#     docker run -it --rm -v "$PWD":/app ev-card-builder sh
#
#   Watch mode (development):
#     docker run -it --rm -v "$PWD":/app ev-card-builder npm start