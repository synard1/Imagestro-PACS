FROM registry.dto.kemkes.go.id/pub/dicom-router:latest

# Copy entrypoint custom
#COPY entrypoint.sh /entrypoint.sh
#RUN chmod +x /entrypoint.sh

COPY --chmod=755 entrypoint.sh /custom-entrypoint.sh

ENTRYPOINT ["/custom-entrypoint.sh"]
