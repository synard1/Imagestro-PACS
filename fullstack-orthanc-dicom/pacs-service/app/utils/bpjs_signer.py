import hmac
import hashlib
import base64
import time

def generate_bpjs_headers(cons_id: str, secret_key: str):
    """Generates BPJS-compatible HMAC-SHA256 headers"""
    timestamp = str(int(time.time()))
    data = cons_id + "&" + timestamp
    signature = hmac.new(
        secret_key.encode('utf-8'),
        data.encode('utf-8'),
        hashlib.sha256
    ).digest()
    encoded_signature = base64.b64encode(signature).decode('utf-8')
    
    return {
        "X-Cons-ID": cons_id,
        "X-Timestamp": timestamp,
        "X-Signature": encoded_signature
    }
