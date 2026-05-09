"""
Helper Utilities
"""

import uuid
from datetime import date, datetime
from typing import Optional


def generate_uid() -> str:
    """Generate a unique identifier"""
    return str(uuid.uuid4())


def format_bytes(bytes_size: int) -> str:
    """Format bytes to human-readable string"""
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if bytes_size < 1024.0:
            return f"{bytes_size:.2f} {unit}"
        bytes_size /= 1024.0
    return f"{bytes_size:.2f} PB"


def calculate_age(birth_date: date, reference_date: Optional[date] = None) -> int:
    """Calculate age from birth date"""
    if reference_date is None:
        reference_date = date.today()
    
    age = reference_date.year - birth_date.year
    if (reference_date.month, reference_date.day) < (birth_date.month, birth_date.day):
        age -= 1
    
    return age


def parse_dicom_date(dicom_date: str) -> Optional[date]:
    """Parse DICOM date string (YYYYMMDD) to date object"""
    if not dicom_date or len(dicom_date) != 8:
        return None
    try:
        return datetime.strptime(dicom_date, "%Y%m%d").date()
    except ValueError:
        return None


def parse_dicom_time(dicom_time: str) -> Optional[str]:
    """Parse DICOM time string (HHMMSS) to time string"""
    if not dicom_time:
        return None
    try:
        # DICOM time can be HHMMSS or HHMMSS.FFFFFF
        time_part = dicom_time.split('.')[0]
        if len(time_part) >= 6:
            return f"{time_part[0:2]}:{time_part[2:4]}:{time_part[4:6]}"
        return None
    except:
        return None
