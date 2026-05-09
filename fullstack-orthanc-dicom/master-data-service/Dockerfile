FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gosu \
    curl \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN grep -q "^appuser:" /etc/passwd || adduser --system --no-create-home --uid 1001 appuser

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --quiet --upgrade pip && \
    pip install --no-cache-dir --quiet -r requirements.txt

# Copy application code
COPY . .

# Make entrypoint executable
RUN chmod +x /app/entrypoint.sh

# Set ownership
RUN chown -R appuser /app

# Expose port
EXPOSE 8002

# Switch to non-root user
USER appuser

# Use entrypoint script
ENTRYPOINT ["/app/entrypoint.sh"]