# Coinglass Multi-Stage Dockerfile
# Stage 1: Build Frontend
FROM node:20-alpine AS frontend-builder

# Install pnpm for faster installs
RUN npm install -g pnpm

# Set working directory
WORKDIR /app/frontend

# Copy frontend files
COPY frontend/package.json frontend/pnpm-lock.yaml* ./

# Install dependencies
RUN if [ -f pnpm-lock.yaml ]; then pnpm install; else npm install; fi

# Copy source
COPY frontend/ .

# Build frontend
RUN npm run build

# Stage 2: Backend
FROM python:3.11-slim AS backend

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY backend/requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY backend/ .

# Create data directory
RUN mkdir -p /app/data

# Copy built frontend from stage 1
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Expose port
EXPOSE 8000

# Run the application - serve both frontend and backend
# Using a custom startup script that serves frontend static files
CMD ["sh", "-c", "echo 'Serving Coinglass API on port 8000' && uvicorn backend.main:app --host 0.0.0.0 --port 8000"]
