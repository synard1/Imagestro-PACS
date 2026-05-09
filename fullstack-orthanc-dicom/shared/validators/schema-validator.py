"""
Unified Schema Validator for DICOM Order Management
Provides robust validation for order data across both services
"""

import json
import jsonschema
from jsonschema import validate, ValidationError, Draft7Validator
from datetime import datetime, date
import re
from typing import Dict, List, Any, Optional, Tuple
import logging
from pathlib import Path

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class UnifiedSchemaValidator:
    """
    Unified schema validator for DICOM order management
    Supports both order-management and accession-api services
    """
    
    def __init__(self, schema_path: Optional[str] = None):
        """
        Initialize validator with schema
        
        Args:
            schema_path: Path to JSON schema file
        """
        if schema_path is None:
            # Default schema path relative to this file
            current_dir = Path(__file__).parent
            schema_path = current_dir.parent / "schemas" / "unified-schema.json"
        
        self.schema_path = Path(schema_path)
        self.schema = self._load_schema()
        self.validator = Draft7Validator(self.schema)
        
    def _load_schema(self) -> Dict[str, Any]:
        """Load JSON schema from file"""
        try:
            with open(self.schema_path, 'r', encoding='utf-8') as f:
                schema = json.load(f)
            logger.info(f"Schema loaded successfully from {self.schema_path}")
            return schema
        except FileNotFoundError:
            logger.error(f"Schema file not found: {self.schema_path}")
            raise
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in schema file: {e}")
            raise
    
    def validate_data(self, data: Dict[str, Any]) -> Tuple[bool, List[str]]:
        """
        Validate data against unified schema
        
        Args:
            data: Data to validate
            
        Returns:
            Tuple of (is_valid, error_messages)
        """
        errors = []
        
        try:
            # Basic schema validation
            validate(instance=data, schema=self.schema)
            
            # Additional custom validations
            custom_errors = self._custom_validations(data)
            errors.extend(custom_errors)
            
            is_valid = len(errors) == 0
            
            if is_valid:
                logger.info("Data validation successful")
            else:
                logger.warning(f"Data validation failed with {len(errors)} errors")
                
            return is_valid, errors
            
        except ValidationError as e:
            errors.append(f"Schema validation error: {e.message}")
            logger.error(f"Schema validation failed: {e.message}")
            return False, errors
        except Exception as e:
            errors.append(f"Unexpected validation error: {str(e)}")
            logger.error(f"Unexpected validation error: {e}")
            return False, errors
    
    def _custom_validations(self, data: Dict[str, Any]) -> List[str]:
        """
        Perform custom validations beyond JSON schema
        
        Args:
            data: Data to validate
            
        Returns:
            List of error messages
        """
        errors = []
        
        # Validate birth_date is not in the future
        if 'birth_date' in data:
            try:
                birth_date = datetime.strptime(data['birth_date'], '%Y-%m-%d').date()
                if birth_date > date.today():
                    errors.append("birth_date cannot be in the future")
            except ValueError:
                errors.append("birth_date must be in YYYY-MM-DD format")
        
        # Validate scheduled_at is in the future
        if 'scheduled_at' in data:
            try:
                scheduled_dt = datetime.fromisoformat(data['scheduled_at'].replace('Z', '+00:00'))
                if scheduled_dt.replace(tzinfo=None) <= datetime.now():
                    errors.append("scheduled_at must be in the future")
            except ValueError:
                errors.append("scheduled_at must be in valid ISO 8601 format")
        
        # Validate NIK checksum (simplified Indonesian NIK validation)
        if 'patient_national_id' in data:
            nik = data['patient_national_id']
            if not self._validate_nik_format(nik):
                errors.append("patient_national_id has invalid NIK format")
        
        # Validate medical record number format
        if 'medical_record_number' in data:
            mrn = data['medical_record_number']
            if not re.match(r'^[a-zA-Z0-9\-_]+$', mrn):
                errors.append("medical_record_number contains invalid characters")
        
        # Validate IHS number format
        if 'ihs_number' in data:
            ihs = data['ihs_number']
            if not re.match(r'^P\d{11}$', ihs):
                errors.append("ihs_number must be P followed by 11 digits")
        
        return errors
    
    def _validate_nik_format(self, nik: str) -> bool:
        """
        Validate Indonesian NIK format
        Basic validation - checks length and digit format
        
        Args:
            nik: National ID to validate
            
        Returns:
            True if valid format
        """
        if not re.match(r'^\d{16}$', nik):
            return False
        
        # Additional NIK validation logic can be added here
        # For now, just check basic format
        return True
    
    def get_validation_errors_detailed(self, data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Get detailed validation errors with field paths
        
        Args:
            data: Data to validate
            
        Returns:
            List of detailed error dictionaries
        """
        detailed_errors = []
        
        # Get schema validation errors
        for error in self.validator.iter_errors(data):
            detailed_errors.append({
                'field': '.'.join(str(p) for p in error.absolute_path),
                'message': error.message,
                'invalid_value': error.instance,
                'type': 'schema_error'
            })
        
        # Get custom validation errors
        custom_errors = self._custom_validations(data)
        for error_msg in custom_errors:
            detailed_errors.append({
                'field': 'custom_validation',
                'message': error_msg,
                'type': 'custom_error'
            })
        
        return detailed_errors
    
    def normalize_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Normalize data to ensure consistency
        
        Args:
            data: Raw data
            
        Returns:
            Normalized data
        """
        normalized = data.copy()
        
        # Normalize gender values
        if 'gender' in normalized:
            gender_map = {
                'M': 'male',
                'F': 'female', 
                'L': 'male',
                'P': 'female',
                '1': 'male',
                '2': 'female'
            }
            gender = normalized['gender'].strip().upper()
            if gender in gender_map:
                normalized['gender'] = gender_map[gender]
        
        # Normalize modality to uppercase
        if 'modality' in normalized:
            normalized['modality'] = normalized['modality'].upper()
        
        # Normalize procedure_code to uppercase
        if 'procedure_code' in normalized:
            normalized['procedure_code'] = normalized['procedure_code'].upper()
        
        # Strip whitespace from string fields
        string_fields = [
            'patient_name', 'procedure_name', 'clinical_indication',
            'ordering_physician_name', 'performing_physician_name',
            'patient_phone', 'patient_address'
        ]
        
        for field in string_fields:
            if field in normalized and isinstance(normalized[field], str):
                normalized[field] = normalized[field].strip()
        
        return normalized
    
    def validate_and_normalize(self, data: Dict[str, Any]) -> Tuple[bool, Dict[str, Any], List[str]]:
        """
        Validate and normalize data in one step
        
        Args:
            data: Raw data
            
        Returns:
            Tuple of (is_valid, normalized_data, error_messages)
        """
        # First normalize
        normalized_data = self.normalize_data(data)
        
        # Then validate
        is_valid, errors = self.validate_data(normalized_data)
        
        return is_valid, normalized_data, errors


# Convenience functions for easy import
def validate_order_data(data: Dict[str, Any], schema_path: Optional[str] = None) -> Tuple[bool, List[str]]:
    """
    Convenience function to validate order data
    
    Args:
        data: Order data to validate
        schema_path: Optional custom schema path
        
    Returns:
        Tuple of (is_valid, error_messages)
    """
    validator = UnifiedSchemaValidator(schema_path)
    return validator.validate_data(data)


def normalize_order_data(data: Dict[str, Any], schema_path: Optional[str] = None) -> Dict[str, Any]:
    """
    Convenience function to normalize order data
    
    Args:
        data: Order data to normalize
        schema_path: Optional custom schema path
        
    Returns:
        Normalized data
    """
    validator = UnifiedSchemaValidator(schema_path)
    return validator.normalize_data(data)


def validate_and_normalize_order_data(data: Dict[str, Any], schema_path: Optional[str] = None) -> Tuple[bool, Dict[str, Any], List[str]]:
    """
    Convenience function to validate and normalize order data
    
    Args:
        data: Order data to validate and normalize
        schema_path: Optional custom schema path
        
    Returns:
        Tuple of (is_valid, normalized_data, error_messages)
    """
    validator = UnifiedSchemaValidator(schema_path)
    return validator.validate_and_normalize(data)


if __name__ == "__main__":
    # Example usage
    sample_data = {
        "modality": "ct",
        "procedure_code": "ctabdomen",
        "procedure_name": "CT Abdomen with Contrast",
        "scheduled_at": "2025-12-25T10:00:00Z",
        "patient_national_id": "1234567890123456",
        "patient_name": "John Doe",
        "gender": "M",
        "birth_date": "1990-01-01",
        "medical_record_number": "MRN123456",
        "ihs_number": "P02478375538"
    }
    
    validator = UnifiedSchemaValidator()
    is_valid, normalized_data, errors = validator.validate_and_normalize(sample_data)
    
    print(f"Valid: {is_valid}")
    print(f"Normalized data: {json.dumps(normalized_data, indent=2)}")
    if errors:
        print(f"Errors: {errors}")