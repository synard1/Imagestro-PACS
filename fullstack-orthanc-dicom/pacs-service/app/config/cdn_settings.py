"""
CDN Configuration for PACS Static Assets
Supports CloudFront, BunnyCDN, Cloudflare, etc.
"""

import os
from typing import Optional

CDN_ENABLED = os.getenv('CDN_ENABLED', 'false').lower() == 'true'
CDN_ENDPOINT = os.getenv('CDN_ENDPOINT', '')  # e.g. https://d1abc123.cloudfront.net
CDN_BUCKET_PATH = os.getenv('CDN_BUCKET_PATH', '')  # e.g. /pacs-archive/
CDN_EXPIRES_MINUTES = int(os.getenv('CDN_EXPIRES_MINUTES', '60'))
CDN_SIGNED_URLS = os.getenv('CDN_SIGNED_URLS', 'false').lower() == 'true'

def get_cdn_url(s3_url: str) -> str:
    """
    Generate CDN URL from S3 URL
    
    Args:
        s3_url: Original S3 URL
        
    Returns:
        CDN-prefixed URL or original URL
    """
    if not CDN_ENABLED or not CDN_ENDPOINT:
        return s3_url
    
    # Replace S3 endpoint with CDN
    cdn_url = s3_url.replace('s3.amazonaws.com', CDN_ENDPOINT.replace('https://', '').replace('http://', ''))
    if CDN_BUCKET_PATH:
        cdn_url = cdn_url.replace(f's3://{os.getenv("S3_BUCKET_NAME")}/', f'{CDN_ENDPOINT}/{CDN_BUCKET_PATH}')
    
    return cdn_url


def is_cdn_configured() -> bool:
    """Check if CDN is properly configured"""
    return CDN_ENABLED and bool(CDN_ENDPOINT)
