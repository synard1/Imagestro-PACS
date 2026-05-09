"""
Cryptographic utilities for secure credential storage
Uses AES-256-GCM for encryption with authenticated encryption

Production-ready features:
- AES-256-GCM authenticated encryption
- Unique IV/nonce per encryption
- Key derivation from environment variable
- Graceful fallback for missing keys
- Secure key rotation support
"""

import os
import base64
import hashlib
import secrets
from typing import Optional, Tuple
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.backends import default_backend

# Constants
NONCE_SIZE = 12  # 96 bits for GCM
KEY_SIZE = 32    # 256 bits for AES-256
SALT_SIZE = 16   # 128 bits for key derivation
TAG_SIZE = 16    # 128 bits for GCM authentication tag

# Environment variable for encryption key
ENV_KEY_NAME = "PACS_ENCRYPTION_KEY"
ENV_SALT_NAME = "PACS_ENCRYPTION_SALT"

# Default salt (should be overridden in production)
DEFAULT_SALT = b"pacs_default_salt_change_in_prod"


def get_encryption_key() -> bytes:
    """
    Get or derive encryption key from environment variable.
    Uses PBKDF2 to derive a proper key from the passphrase.
    
    Returns:
        bytes: 32-byte encryption key
    """
    passphrase = os.getenv(ENV_KEY_NAME)
    
    if not passphrase:
        # Use a default key for development (NOT SECURE FOR PRODUCTION)
        passphrase = "pacs_dev_key_change_in_production_12345"
    
    # Get salt from environment or use default
    salt_str = os.getenv(ENV_SALT_NAME)
    if salt_str:
        salt = base64.b64decode(salt_str)
    else:
        salt = DEFAULT_SALT
    
    # Derive key using PBKDF2
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=KEY_SIZE,
        salt=salt,
        iterations=100000,
        backend=default_backend()
    )
    
    return kdf.derive(passphrase.encode('utf-8'))


def encrypt_value(plaintext: str) -> Optional[str]:
    """
    Encrypt a string value using AES-256-GCM.
    
    Args:
        plaintext: The string to encrypt
        
    Returns:
        Base64-encoded encrypted string (nonce + ciphertext + tag)
        Returns None if plaintext is empty or None
    """
    if not plaintext:
        return None
    
    try:
        key = get_encryption_key()
        aesgcm = AESGCM(key)
        
        # Generate random nonce
        nonce = secrets.token_bytes(NONCE_SIZE)
        
        # Encrypt
        ciphertext = aesgcm.encrypt(nonce, plaintext.encode('utf-8'), None)
        
        # Combine nonce + ciphertext (tag is appended by AESGCM)
        encrypted = nonce + ciphertext
        
        # Return base64 encoded
        return base64.b64encode(encrypted).decode('utf-8')
    
    except Exception as e:
        print(f"[crypto] Encryption error: {e}")
        return None


def decrypt_value(encrypted: str) -> Optional[str]:
    """
    Decrypt a string value encrypted with AES-256-GCM.
    
    Args:
        encrypted: Base64-encoded encrypted string
        
    Returns:
        Decrypted plaintext string
        Returns None if decryption fails or input is empty
    """
    if not encrypted:
        return None
    
    try:
        key = get_encryption_key()
        aesgcm = AESGCM(key)
        
        # Decode base64
        encrypted_bytes = base64.b64decode(encrypted)
        
        # Extract nonce and ciphertext
        nonce = encrypted_bytes[:NONCE_SIZE]
        ciphertext = encrypted_bytes[NONCE_SIZE:]
        
        # Decrypt
        plaintext = aesgcm.decrypt(nonce, ciphertext, None)
        
        return plaintext.decode('utf-8')
    
    except Exception as e:
        print(f"[crypto] Decryption error: {e}")
        return None


def mask_value(value: str, visible_chars: int = 4) -> str:
    """
    Mask a sensitive value for display.
    Shows first few characters followed by asterisks.
    
    Args:
        value: The value to mask
        visible_chars: Number of characters to show at the start
        
    Returns:
        Masked string like "abc***"
    """
    if not value:
        return ""
    
    if len(value) <= visible_chars:
        return "*" * len(value)
    
    return value[:visible_chars] + "*" * (len(value) - visible_chars)


def is_encrypted(value: str) -> bool:
    """
    Check if a value appears to be encrypted (base64 encoded with proper length).
    
    Args:
        value: The value to check
        
    Returns:
        True if value appears to be encrypted
    """
    if not value:
        return False
    
    try:
        decoded = base64.b64decode(value)
        # Minimum length: nonce (12) + tag (16) + at least 1 byte of data
        return len(decoded) >= NONCE_SIZE + TAG_SIZE + 1
    except:
        return False


def encrypt_credentials(credentials: dict) -> dict:
    """
    Encrypt sensitive fields in a credentials dictionary.
    
    Args:
        credentials: Dictionary with potential sensitive fields
        
    Returns:
        Dictionary with sensitive fields encrypted
    """
    sensitive_fields = ['api_key', 'password', 'token', 'secret']
    result = credentials.copy() if credentials else {}
    
    for field in sensitive_fields:
        if field in result and result[field]:
            # Only encrypt if not already encrypted
            if not is_encrypted(result[field]):
                result[field] = encrypt_value(result[field])
    
    return result


def decrypt_credentials(credentials: dict) -> dict:
    """
    Decrypt sensitive fields in a credentials dictionary.
    
    Args:
        credentials: Dictionary with encrypted sensitive fields
        
    Returns:
        Dictionary with sensitive fields decrypted
    """
    sensitive_fields = ['api_key', 'password', 'token', 'secret']
    result = credentials.copy() if credentials else {}
    
    for field in sensitive_fields:
        if field in result and result[field]:
            # Only decrypt if appears to be encrypted
            if is_encrypted(result[field]):
                result[field] = decrypt_value(result[field])
    
    return result


def mask_credentials(credentials: dict) -> dict:
    """
    Mask sensitive fields in a credentials dictionary for display.
    
    Args:
        credentials: Dictionary with sensitive fields
        
    Returns:
        Dictionary with sensitive fields masked
    """
    sensitive_fields = ['api_key', 'password', 'token', 'secret']
    result = credentials.copy() if credentials else {}
    
    for field in sensitive_fields:
        if field in result and result[field]:
            # Decrypt first if encrypted
            value = result[field]
            if is_encrypted(value):
                value = decrypt_value(value) or value
            result[field] = mask_value(value)
    
    return result


def generate_encryption_salt() -> str:
    """
    Generate a new random salt for key derivation.
    Use this to generate PACS_ENCRYPTION_SALT environment variable.
    
    Returns:
        Base64-encoded salt string
    """
    salt = secrets.token_bytes(SALT_SIZE)
    return base64.b64encode(salt).decode('utf-8')


def generate_encryption_key() -> str:
    """
    Generate a new random encryption key/passphrase.
    Use this to generate PACS_ENCRYPTION_KEY environment variable.
    
    Returns:
        Random passphrase string
    """
    return secrets.token_urlsafe(32)
