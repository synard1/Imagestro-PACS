"""
Example of how to integrate existing services with the Master Data Service
This is a demonstration of the changes needed in other services
"""

import os
import requests
import logging
from functools import wraps

# Example configuration for a service that needs to integrate with Master Data Service
MASTER_DATA_SERVICE_URL = os.getenv('MASTER_DATA_SERVICE_URL', 'http://master-data-service:8002')

logger = logging.getLogger(__name__)

def get_jwt_token():
    """
    Get current JWT token from request context
    This is a placeholder - in real implementation, you would get this from your auth system
    """
    # This would typically come from request headers or session
    return "current-user-jwt-token"

def get_patient_info(patient_national_id):
    """
    Fetch patient information from Master Data Service
    This replaces direct database queries for patient data
    """
    try:
        headers = {
            'Authorization': f'Bearer {get_jwt_token()}'
        }
        response = requests.get(
            f"{MASTER_DATA_SERVICE_URL}/patients/{patient_national_id}",
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            return response.json().get('patient')
        elif response.status_code == 404:
            logger.warning(f"Patient not found: {patient_national_id}")
            return None
        else:
            logger.error(f"Failed to fetch patient {patient_national_id}: {response.status_code} - {response.text}")
            return None
            
    except requests.exceptions.RequestException as e:
        logger.error(f"Network error fetching patient {patient_national_id}: {str(e)}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error fetching patient {patient_national_id}: {str(e)}")
        return None

def validate_patient_exists(patient_national_id):
    """
    Validate that a patient exists in the Master Data Service
    """
    patient = get_patient_info(patient_national_id)
    return patient is not None

def enrich_with_patient_data(data):
    """
    Enrich data with patient information from Master Data Service
    """
    patient_national_id = data.get('patient_national_id')
    if not patient_national_id:
        return data, "Missing patient_national_id"
    
    patient = get_patient_info(patient_national_id)
    if not patient:
        return data, f"Patient not found: {patient_national_id}"
    
    # Enrich the data with patient information
    enriched_data = data.copy()
    enriched_data['patient_name'] = patient.get('patient_name', '')
    enriched_data['gender'] = patient.get('gender', '')
    enriched_data['birth_date'] = patient.get('birth_date')
    enriched_data['medical_record_number'] = patient.get('medical_record_number', '')
    enriched_data['ihs_number'] = patient.get('ihs_number', '')
    
    return enriched_data, None

# Example decorator to require patient validation
def require_valid_patient(f):
    """
    Decorator to ensure patient exists before processing request
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Extract patient_national_id from function arguments or request data
        # This is a simplified example
        patient_national_id = kwargs.get('patient_national_id')
        if not patient_national_id:
            # In a real Flask application, you would get this from request.json
            # For this example, we'll skip the Flask import to avoid linting errors
            # patient_national_id = request.json.get('patient_national_id') if request.json else None
            pass
        
        if not patient_national_id:
            return {"error": "Missing patient_national_id"}, 400
        
        if not validate_patient_exists(patient_national_id):
            return {"error": "Patient not found in master data service"}, 404
        
        return f(*args, **kwargs)
    return decorated_function

# Example usage in an order creation function
@require_valid_patient
def create_order(order_data):
    """
    Example of creating an order with patient validation
    """
    # Patient validation is handled by the decorator
    
    # Enrich order data with patient information
    enriched_data, error = enrich_with_patient_data(order_data)
    if error:
        return {"error": error}, 400
    
    # Proceed with order creation logic
    # ... (database insert, etc.)
    
    return {
        "status": "success",
        "message": "Order created successfully",
        "order_data": enriched_data
    }

# Example of how to search for patients
def search_patients(query_params):
    """
    Search for patients using the Master Data Service
    """
    try:
        headers = {
            'Authorization': f'Bearer {get_jwt_token()}'
        }
        response = requests.get(
            f"{MASTER_DATA_SERVICE_URL}/patients/search",
            params=query_params,
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            return response.json()
        else:
            logger.error(f"Failed to search patients: {response.status_code} - {response.text}")
            return {"error": "Failed to search patients"}
            
    except requests.exceptions.RequestException as e:
        logger.error(f"Network error searching patients: {str(e)}")
        return {"error": "Network error"}
    except Exception as e:
        logger.error(f"Unexpected error searching patients: {str(e)}")
        return {"error": "Unexpected error"}

# Example usage
if __name__ == "__main__":
    # Example of searching for patients
    search_results = search_patients({
        "patient_name": "John",
        "medical_record_number": "MRN"
    })
    print("Search results:", search_results)
    
    # Example of validating a patient
    is_valid = validate_patient_exists("1234567890123456")
    print("Patient valid:", is_valid)