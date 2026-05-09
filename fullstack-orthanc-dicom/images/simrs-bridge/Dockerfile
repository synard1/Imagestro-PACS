# pakai ARG supaya fleksibel (bisa fallback ke Docker Hub lagi nanti)
ARG BASE_IMAGE=mirror.gcr.io/library/python:3.11-slim
FROM ${BASE_IMAGE}

WORKDIR /srv
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

# lib ssl/certs kalau perlu TLS
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir --upgrade pip
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py .
EXPOSE 8089
CMD ["uvicorn", "app:api", "--host", "0.0.0.0", "--port", "8089"]
