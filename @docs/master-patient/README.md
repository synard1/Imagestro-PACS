# Master Data Service

Centralized service for managing master data entities including patient information.

## Overview

The Master Data Service provides a centralized repository for all master data entities in the healthcare system. Initially focused on patient master data management, this service consolidates patient information that was previously distributed across multiple services.

## Features

- Centralized patient master data management
- RESTful API with JWT authentication
- Comprehensive patient data model including demographics, allergies, medical history, etc.
- Audit logging for all data changes
- Soft delete functionality
- Search capabilities

## API Endpoints

### Patient Management

- `POST /patients` - Create a new patient
- `GET /patients/<patient_id_or_nik>` - Retrieve patient by ID or NIK
- `PUT /patients/<patient_id>` - Update patient information
- `DELETE /patients/<patient_id>` - Soft delete a patient
- `GET /patients/search` - Search patients by various criteria

### Authentication

All endpoints require JWT authentication with appropriate permissions:
- `patient:create` - Create patients
- `patient:read` - Read patient information
- `patient:update` - Update patient information
- `patient:delete` - Delete patients
- `patient:search` - Search patients

## Database Schema

The service uses the following tables:

1. `patients` - Main patient information
2. `patient_allergies` - Patient allergy records
3. `patient_medical_history` - Patient medical history
4. `patient_family_history` - Patient family medical history
5. `patient_medications` - Patient medication records
6. `patient_audit_log` - Audit trail for all patient data changes

## Integration

The service is integrated with the API Gateway which handles authentication and routing. All requests should be made through the gateway at `/patients/*` endpoints.

## Environment Variables

- `POSTGRES_HOST` - PostgreSQL database host
- `POSTGRES_DB` - PostgreSQL database name
- `POSTGRES_USER` - PostgreSQL username
- `POSTGRES_PASSWORD` - PostgreSQL password
- `JWT_SECRET` - Secret key for JWT token validation
- `JWT_ALGORITHM` - Algorithm for JWT token validation

## Deployment

The service is deployed as part of the docker-compose stack. It automatically initializes the database schema on startup.