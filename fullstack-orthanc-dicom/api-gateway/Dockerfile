FROM python:3.12-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends gosu curl && \
    rm -rf /var/lib/apt/lists/*

# Create appuser
RUN adduser --system --no-create-home --uid 1001 appuser && \
    mkdir -p /home/appuser && chown appuser /home/appuser

# Set working directory
WORKDIR /app

# Copy application code
COPY . /app

# Change ownership of /app to appuser
RUN chown -R appuser /app

# Switch to appuser
USER appuser

# Install Python dependencies
RUN mkdir -p /home/appuser/.local/bin /home/appuser/.local/lib/python3.12/site-packages && \
    chown -R appuser /home/appuser/.local && \
    pip install --no-cache-dir -r requirements.txt --prefix=/home/appuser/.local && \
    pip list
ENV PATH="/home/appuser/.local/bin:$PATH" \
    PYTHONPATH="/home/appuser/.local/lib/python3.12/site-packages"
RUN echo "PATH: $PATH" && ls -l /home/appuser/.local/bin

# Expose port
EXPOSE 8888

# Run the application
CMD ["python", "-m", "gunicorn", "--bind", "0.0.0.0:8888", "api_gateway:app"]
