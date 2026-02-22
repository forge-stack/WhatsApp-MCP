# SALESFORCE MCP Server - Production Dockerfile
# Optimized for FastMCP SSE server

FROM python:3.11-slim

# Prevent Python from writing pyc files & enable unbuffered logs
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Set work directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy only requirements first (leverage Docker cache)
COPY requirements.txt .

# Install Python dependencies
RUN pip install --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY main.py .

# Create non-root user for security
RUN adduser --disabled-password --gecos '' mcpuser \
    && chown -R mcpuser:mcpuser /app
USER mcpuser

# Expose MCP server port
EXPOSE 8001

# Health check - SSE endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:8001/health || exit 1

# Run the MCP server
CMD ["python", "main.py"]