"""
S3-Compatible Storage Adapter
Supports AWS S3, MinIO, Contabo, Wasabi, Cloudflare R2, Backblaze B2, and other S3-compatible object storage
"""

import os
import time
import tempfile
from typing import Optional, Dict, Any
from pathlib import Path
import asyncio
import logging

try:
    import boto3
    from botocore.exceptions import ClientError, NoCredentialsError
    from botocore.config import Config
    BOTO3_AVAILABLE = True
except ImportError:
    BOTO3_AVAILABLE = False
    boto3 = None
    ClientError = Exception
    NoCredentialsError = Exception
    Config = None

from app.storage.base_adapter import (
    StorageAdapter,
    StorageError,
    StorageConnectionError,
    StorageOperationError
)

logger = logging.getLogger(__name__)


class S3StorageAdapter(StorageAdapter):
    """
    S3-Compatible storage adapter

    Supports:
    - AWS S3
    - MinIO
    - Contabo Object Storage
    - Wasabi
    - DigitalOcean Spaces
    - Cloudflare R2
    - Backblaze B2
    - And any other S3-compatible storage
    """

    def __init__(self, config: Dict[str, Any]):
        """
        Initialize S3 storage adapter

        Args:
            config: Configuration dictionary with keys:
                - bucket_name
                - access_key
                - secret_key
                - region
                - endpoint_url
                - use_ssl
                - addressing_style: path or virtual or auto (default: auto)
                - on_operation: Optional callback function(op_class: str) -> None
        """
        if not BOTO3_AVAILABLE:
            raise ImportError(
                "boto3 is required for S3 storage adapter. "
                "Install with: pip install boto3"
            )

        super().__init__(config)
        self.on_operation = config.get('on_operation')
        # Required parameters
        self.bucket_name = config.get('bucket_name')
        if not self.bucket_name:
            raise ValueError("bucket_name is required for S3 adapter")

        self.access_key = config.get('access_key') or os.getenv('AWS_ACCESS_KEY_ID')
        self.secret_key = config.get('secret_key') or os.getenv('AWS_SECRET_ACCESS_KEY')

        if not self.access_key or not self.secret_key:
            raise ValueError("access_key and secret_key are required for S3 adapter")

        # Optional parameters
        self.region = config.get('region', 'us-east-1')
        self.endpoint_url = config.get('endpoint_url')  # For S3-compatible services
        self.use_ssl = config.get('use_ssl', True)
        self.auto_create_bucket = config.get('auto_create_bucket', False)
        self._bucket_ready = False

        # Boto3 configuration
        boto_config_params = {
            'region_name': self.region,
            'signature_version': 's3v4',
            'retries': {
                'max_attempts': 3,
                'mode': 'adaptive'
            }
        }

        # If using path-style addressing (required for MinIO, Backblaze B2, and some providers)
        if config.get('addressing_style') == 'path':
            boto_config_params['s3'] = {'addressing_style': 'path'}

        boto_config = Config(**boto_config_params)

        # Initialize S3 client
        try:
            self.s3_client = boto3.client(
                's3',
                aws_access_key_id=self.access_key,
                aws_secret_access_key=self.secret_key,
                endpoint_url=self.endpoint_url,
                config=boto_config,
                use_ssl=self.use_ssl
            )

            provider = self._detect_provider()
            self.logger.info(f"S3StorageAdapter initialized for {provider} (bucket: {self.bucket_name})")

        except NoCredentialsError:
            raise StorageConnectionError("Invalid S3 credentials")
        except Exception as e:
            raise StorageConnectionError(f"Failed to initialize S3 client: {str(e)}")

    def _detect_provider(self) -> str:
        """Detect S3-compatible provider based on endpoint URL"""
        if not self.endpoint_url:
            return "AWS S3"

        endpoint = self.endpoint_url.lower()
        if 'contabo' in endpoint:
            return "Contabo Object Storage"
        elif 'wasabi' in endpoint:
            return "Wasabi"
        elif 'backblazeb2' in endpoint:
            return "Backblaze B2"
        elif 'r2.cloudflarestorage.com' in endpoint:
            return "Cloudflare R2"
        elif 'digitalocean' in endpoint or 'spaces' in endpoint:
            return "DigitalOcean Spaces"
        elif 'localhost' in endpoint or '127.0.0.1' in endpoint:
            return "MinIO (Local)"
        else:
            return f"S3-Compatible ({self.endpoint_url})"

    async def _ensure_bucket_ready(self):
        """Lazy-initialize: verify (and optionally create) bucket on first use."""
        if self._bucket_ready:
            return
        await self._verify_bucket()

    async def _verify_bucket(self):
        """Verify bucket exists; auto-create if configured; raise on auth errors."""
        try:
            await asyncio.to_thread(self.s3_client.head_bucket, Bucket=self.bucket_name)
            self._bucket_ready = True
            self.logger.info(f"✓ Bucket '{self.bucket_name}' verified")
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code', '')
            if error_code in ('404', 'NoSuchBucket'):
                if self.auto_create_bucket:
                    await self._create_bucket()
                else:
                    self.logger.warning(f"Bucket '{self.bucket_name}' not found — set auto_create_bucket=true to create automatically")
            elif error_code in ('403', 'AccessDenied'):
                raise StorageConnectionError(
                    f"Access denied to bucket '{self.bucket_name}': check access_key/secret_key permissions"
                )
            else:
                raise StorageConnectionError(f"Bucket verification failed ({error_code}): {str(e)}")

    async def _create_bucket(self):
        """Create the configured bucket."""
        try:
            # Cloudflare R2 ('auto' region) and us-east-1 don't need LocationConstraint
            if self.region and self.region not in ('us-east-1', 'auto'):
                await asyncio.to_thread(
                    self.s3_client.create_bucket,
                    Bucket=self.bucket_name,
                    CreateBucketConfiguration={'LocationConstraint': self.region}
                )
            else:
                await asyncio.to_thread(self.s3_client.create_bucket, Bucket=self.bucket_name)
            self._bucket_ready = True
            self.logger.info(f"✓ Created bucket '{self.bucket_name}'")
        except ClientError as e:
            raise StorageConnectionError(f"Failed to create bucket '{self.bucket_name}': {str(e)}")

    async def store(
        self,
        source_path: str,
        destination_key: str,
        metadata: Optional[Dict[str, str]] = None
    ) -> str:
        """
        Store file to S3-compatible storage

        Args:
            source_path: Local file path
            destination_key: S3 object key
            metadata: Optional metadata

        Returns:
            S3 object key
        """
        try:
            if not os.path.exists(source_path):
                raise FileNotFoundError(f"Source file not found: {source_path}")

            await self._ensure_bucket_ready()

            # Prepare metadata
            extra_args = {}
            if metadata:
                extra_args['Metadata'] = metadata

            # Set content type for DICOM files
            if destination_key.endswith('.dcm') or destination_key.endswith('.dicom'):
                extra_args['ContentType'] = 'application/dicom'

            # Upload file
            await asyncio.to_thread(
                self.s3_client.upload_file,
                source_path,
                self.bucket_name,
                destination_key,
                ExtraArgs=extra_args if extra_args else None
            )

            if self.on_operation:
                self.on_operation('A')

            self.logger.info(f"✓ Uploaded to S3: {destination_key}")

            return destination_key

        except ClientError as e:
            self.logger.error(f"S3 upload failed: {str(e)}")
            raise StorageOperationError(f"Upload failed: {str(e)}")
        except Exception as e:
            self.logger.error(f"Unexpected error during upload: {str(e)}")
            raise StorageOperationError(f"Upload failed: {str(e)}")

    async def retrieve(
        self,
        storage_key: str,
        destination_path: Optional[str] = None
    ) -> str:
        """
        Retrieve file from S3

        Args:
            storage_key: S3 object key
            destination_path: Local destination path

        Returns:
            Path to downloaded file
        """
        try:
            # If no destination specified, create temp file
            if not destination_path:
                temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.dcm')
                destination_path = temp_file.name
                temp_file.close()

            # Download file
            await asyncio.to_thread(
                self.s3_client.download_file,
                self.bucket_name,
                storage_key,
                destination_path
            )

            if self.on_operation:
                self.on_operation('B')

            self.logger.info(f"✓ Downloaded from S3: {storage_key}")

            return destination_path

        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code')
            if error_code == 'NoSuchKey':
                raise FileNotFoundError(f"File not found in S3: {storage_key}")
            else:
                raise StorageOperationError(f"Download failed: {str(e)}")
        except Exception as e:
            self.logger.error(f"Unexpected error during download: {str(e)}")
            raise StorageOperationError(f"Download failed: {str(e)}")

    async def delete(self, storage_key: str) -> bool:
        """Delete file from S3. Returns False if object doesn't exist, raises on auth/other errors."""
        # Pre-check: distinguish missing key from auth failures before attempting delete
        try:
            await asyncio.to_thread(self.s3_client.head_object, Bucket=self.bucket_name, Key=storage_key)
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code', '')
            if error_code in ('404', 'NoSuchKey'):
                return False
            raise StorageOperationError(f"Delete pre-check failed ({error_code}): {str(e)}")

        try:
            await asyncio.to_thread(
                self.s3_client.delete_object,
                Bucket=self.bucket_name,
                Key=storage_key
            )

            if self.on_operation:
                self.on_operation('A')

            self.logger.info(f"✓ Deleted from S3: {storage_key}")
            return True

        except ClientError as e:
            self.logger.error(f"S3 delete failed: {str(e)}")
            raise StorageOperationError(f"Delete failed: {str(e)}")

    async def exists(self, storage_key: str) -> bool:
        """Check if file exists in S3"""
        try:
            await asyncio.to_thread(
                self.s3_client.head_object,
                Bucket=self.bucket_name,
                Key=storage_key
            )

            if self.on_operation:
                self.on_operation('B')

            return True

        except ClientError:
            return False
        except Exception as e:
            self.logger.error(f"Error checking existence: {str(e)}")
            return False

    async def get_url(
        self,
        storage_key: str,
        expiration: int = 3600
    ) -> str:
        """
        Generate presigned URL for file access
        """
        try:
            url = await asyncio.to_thread(
                self.s3_client.generate_presigned_url,
                'get_object',
                Params={
                    'Bucket': self.bucket_name,
                    'Key': storage_key
                },
                ExpiresIn=expiration
            )

            if self.on_operation:
                self.on_operation('B')

            return url
        except Exception as e:
            self.logger.error(f"Failed to generate presigned URL: {str(e)}")
            raise StorageOperationError(f"URL generation failed: {str(e)}")

    async def get_metadata(self, storage_key: str) -> Dict[str, Any]:
        """Get S3 object metadata"""
        try:
            response = await asyncio.to_thread(
                self.s3_client.head_object,
                Bucket=self.bucket_name,
                Key=storage_key
            )

            if self.on_operation:
                self.on_operation('B')

            return {

                'size': response.get('ContentLength', 0),
                'size_mb': response.get('ContentLength', 0) / (1024 * 1024),
                'modified': response.get('LastModified'),
                'content_type': response.get('ContentType'),
                'metadata': response.get('Metadata', {}),
                'etag': response.get('ETag', '').strip('"'),
                'storage_class': response.get('StorageClass', 'STANDARD')
            }

        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code')
            if error_code == 'NoSuchKey':
                raise FileNotFoundError(f"File not found: {storage_key}")
            else:
                raise StorageOperationError(f"Get metadata failed: {str(e)}")

    async def list_files(
        self,
        prefix: Optional[str] = None,
        limit: int = 1000
    ) -> list:
        """List files in S3 bucket"""
        try:
            params = {
                'Bucket': self.bucket_name,
                'MaxKeys': limit
            }

            if prefix:
                params['Prefix'] = prefix

            response = await asyncio.to_thread(
                self.s3_client.list_objects_v2,
                **params
            )

            if self.on_operation:
                self.on_operation('A')

            files = []

            for obj in response.get('Contents', []):
                files.append(obj['Key'])

            return files

        except Exception as e:
            self.logger.error(f"Failed to list files: {str(e)}")
            return []

    async def get_stats(self) -> Dict[str, Any]:
        """Get storage statistics"""
        try:
            # List all objects and calculate stats
            paginator = self.s3_client.get_paginator('list_objects_v2')
            pages = paginator.paginate(Bucket=self.bucket_name)

            total_size = 0
            file_count = 0

            for page in pages:
                for obj in page.get('Contents', []):
                    total_size += obj.get('Size', 0)
                    file_count += 1

            return {
                'adapter_type': 's3',
                'provider': self._detect_provider(),
                'bucket': self.bucket_name,
                'region': self.region,
                'endpoint': self.endpoint_url or 'AWS S3',
                'file_count': file_count,
                'total_size_bytes': total_size,
                'total_size_mb': total_size / (1024 * 1024),
                'total_size_gb': total_size / (1024 * 1024 * 1024)
            }

        except Exception as e:
            self.logger.error(f"Failed to get stats: {str(e)}")
            return {
                'adapter_type': 's3',
                'provider': self._detect_provider(),
                'bucket': self.bucket_name,
                'error': str(e)
            }

    async def health_check(self) -> Dict[str, Any]:
        """Check S3 connectivity via HEAD bucket."""
        t0 = time.monotonic()
        try:
            await asyncio.to_thread(self.s3_client.head_bucket, Bucket=self.bucket_name)
            latency_ms = int((time.monotonic() - t0) * 1000)
            return {
                'ok': True,
                'adapter': 'S3StorageAdapter',
                'provider': self._detect_provider(),
                'bucket': self.bucket_name,
                'endpoint': self.endpoint_url or 'AWS S3',
                'latency_ms': latency_ms,
            }
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code', '')
            return {
                'ok': False,
                'adapter': 'S3StorageAdapter',
                'bucket': self.bucket_name,
                'error_code': error_code,
                'error': str(e),
            }
        except Exception as e:
            return {'ok': False, 'adapter': 'S3StorageAdapter', 'error': str(e)}
