FROM python:3.12-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gosu \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Create app user
RUN adduser --system --no-create-home --uid 1001 appuser

# Set working directory
WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir --quiet --upgrade pip && \
    pip install --no-cache-dir --quiet -r requirements.txt

# Copy application code
COPY . .

# Normalize line endings and permissions for scripts
RUN sed -i 's/\r$//' /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh && \
    chown -R appuser /app

# Create health check script (sh)
RUN echo '#!/bin/sh\ncurl -f http://localhost:5000/health || exit 1' > /app/healthcheck.sh && \
    chmod +x /app/healthcheck.sh

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD /app/healthcheck.sh

# Expose port
EXPOSE 5000

# Switch to non-root user and start application
CMD ["gosu", "appuser", "/app/entrypoint.sh"]