#!/bin/sh
set -e

echo "I: [Init] - Preparing /app/in"
mkdir -p /app/in
rm -rf /app/in/*

# Jalankan entrypoint asli bawaan image
exec /app/entrypoint.sh "$@"
