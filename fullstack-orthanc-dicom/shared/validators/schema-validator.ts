/**
 * Unified Schema Validator for DICOM Order Management (TypeScript)
 * Provides robust validation for order data in TypeScript/Node.js services
 */

import Ajv, { JSONSchemaType, ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Types
export interface UnifiedOrderData {
  modality: string;
  procedure_code: string;
  procedure_name: string;
  scheduled_at: string;
  patient_national_id: string;
  patient_name: string;
  gender: 'male' | 'female' | 'other' | 'unknown';
  birth_date: string;
  medical_record_number: string;
  ihs_number: string;
  priority?: 'routine' | 'urgent' | 'stat' | 'asap';
  clinical_indication?: string;
  ordering_physician_name?: string;
  performing_physician_name?: string;
  patient_phone?: string;
  patient_address?: string;
  facility_code?: string;
  station_aet?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  normalizedData?: UnifiedOrderData;
}

export interface DetailedValidationError {
  field: string;
  message: string;
  invalidValue?: any;
  type: 'schema_error' | 'custom_error';
}

export class UnifiedSchemaValidator {
  private ajv: Ajv;
  private schema: any;
  private validateFunction: ValidateFunction<UnifiedOrderData>;

  constructor(schemaPath?: string) {
    this.ajv = new Ajv({ allErrors: true, verbose: true });
    addFormats(this.ajv);
    
    // Load schema
    this.schema = this.loadSchema(schemaPath);
    this.validateFunction = this.ajv.compile(this.schema);
  }

  private loadSchema(schemaPath?: string): any {
    try {
      if (!schemaPath) {
        // Default schema path relative to this file
        const currentDir = dirname(fileURLToPath(import.meta.url));
        schemaPath = join(currentDir, '..', 'schemas', 'unified-schema.json');
      }
      
      const schemaContent = readFileSync(schemaPath, 'utf-8');
      const schema = JSON.parse(schemaContent);
      
      console.log(`Schema loaded successfully from ${schemaPath}`);
      return schema;
    } catch (error) {
      console.error(`Failed to load schema: ${error}`);
      throw error;
    }
  }

  public validateData(data: any): ValidationResult {
    const errors: string[] = [];
    
    try {
      // Basic schema validation
      const isSchemaValid = this.validateFunction(data);
      
      if (!isSchemaValid && this.validateFunction.errors) {
        for (const error of this.validateFunction.errors) {
          const field = error.instancePath || error.schemaPath;
          errors.push(`${field}: ${error.message}`);
        }
      }
      
      // Additional custom validations
      const customErrors = this.performCustomValidations(data);
      errors.push(...customErrors);
      
      const isValid = errors.length === 0;
      
      if (isValid) {
        console.log('Data validation successful');
      } else {
        console.warn(`Data validation failed with ${errors.length} errors`);
      }
      
      return {
        isValid,
        errors
      };
      
    } catch (error) {
      errors.push(`Unexpected validation error: ${error}`);
      console.error(`Unexpected validation error: ${error}`);
      return {
        isValid: false,
        errors
      };
    }
  }

  private performCustomValidations(data: any): string[] {
    const errors: string[] = [];
    
    // Validate birth_date is not in the future
    if (data.birth_date) {
      try {
        const birthDate = new Date(data.birth_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (birthDate > today) {
          errors.push('birth_date cannot be in the future');
        }
      } catch {
        errors.push('birth_date must be in YYYY-MM-DD format');
      }
    }
    
    // Validate scheduled_at is in the future
    if (data.scheduled_at) {
      try {
        const scheduledDate = new Date(data.scheduled_at);
        const now = new Date();
        
        if (scheduledDate <= now) {
          errors.push('scheduled_at must be in the future');
        }
      } catch {
        errors.push('scheduled_at must be in valid ISO 8601 format');
      }
    }
    
    // Validate NIK format (Indonesian National ID)
    if (data.patient_national_id) {
      if (!this.validateNikFormat(data.patient_national_id)) {
        errors.push('patient_national_id has invalid NIK format');
      }
    }
    
    // Validate medical record number format
    if (data.medical_record_number) {
      if (!/^[a-zA-Z0-9\-_]+$/.test(data.medical_record_number)) {
        errors.push('medical_record_number contains invalid characters');
      }
    }
    
    // Validate IHS number format
    if (data.ihs_number) {
      if (!/^P\d{11}$/.test(data.ihs_number)) {
        errors.push('ihs_number must be P followed by 11 digits');
      }
    }
    
    return errors;
  }

  private validateNikFormat(nik: string): boolean {
    // Basic NIK validation - 16 digits
    if (!/^\d{16}$/.test(nik)) {
      return false;
    }
    
    // Additional NIK validation logic can be added here
    return true;
  }

  public getDetailedValidationErrors(data: any): DetailedValidationError[] {
    const detailedErrors: DetailedValidationError[] = [];
    
    // Get schema validation errors
    const isValid = this.validateFunction(data);
    if (!isValid && this.validateFunction.errors) {
      for (const error of this.validateFunction.errors) {
        detailedErrors.push({
          field: error.instancePath || error.schemaPath || 'unknown',
          message: error.message || 'Unknown error',
          invalidValue: error.data,
          type: 'schema_error'
        });
      }
    }
    
    // Get custom validation errors
    const customErrors = this.performCustomValidations(data);
    for (const errorMsg of customErrors) {
      detailedErrors.push({
        field: 'custom_validation',
        message: errorMsg,
        type: 'custom_error'
      });
    }
    
    return detailedErrors;
  }

  public normalizeData(data: any): UnifiedOrderData {
    const normalized = { ...data };
    
    // Normalize gender values
    if (normalized.gender) {
      const genderMap: Record<string, string> = {
        'M': 'male',
        'F': 'female',
        'L': 'male',
        'P': 'female',
        '1': 'male',
        '2': 'female'
      };
      
      const gender = normalized.gender.toString().trim().toUpperCase();
      if (genderMap[gender]) {
        normalized.gender = genderMap[gender];
      }
    }
    
    // Normalize modality to uppercase
    if (normalized.modality) {
      normalized.modality = normalized.modality.toString().toUpperCase();
    }
    
    // Normalize procedure_code to uppercase
    if (normalized.procedure_code) {
      normalized.procedure_code = normalized.procedure_code.toString().toUpperCase();
    }
    
    // Strip whitespace from string fields
    const stringFields = [
      'patient_name', 'procedure_name', 'clinical_indication',
      'ordering_physician_name', 'performing_physician_name',
      'patient_phone', 'patient_address'
    ];
    
    for (const field of stringFields) {
      if (normalized[field] && typeof normalized[field] === 'string') {
        normalized[field] = normalized[field].trim();
      }
    }
    
    return normalized as UnifiedOrderData;
  }

  public validateAndNormalize(data: any): ValidationResult {
    // First normalize
    const normalizedData = this.normalizeData(data);
    
    // Then validate
    const validationResult = this.validateData(normalizedData);
    
    return {
      ...validationResult,
      normalizedData: validationResult.isValid ? normalizedData : undefined
    };
  }
}

// Convenience functions
export function validateOrderData(data: any, schemaPath?: string): ValidationResult {
  const validator = new UnifiedSchemaValidator(schemaPath);
  return validator.validateData(data);
}

export function normalizeOrderData(data: any, schemaPath?: string): UnifiedOrderData {
  const validator = new UnifiedSchemaValidator(schemaPath);
  return validator.normalizeData(data);
}

export function validateAndNormalizeOrderData(data: any, schemaPath?: string): ValidationResult {
  const validator = new UnifiedSchemaValidator(schemaPath);
  return validator.validateAndNormalize(data);
}

// Example usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const sampleData = {
    modality: 'ct',
    procedure_code: 'ctabdomen',
    procedure_name: 'CT Abdomen with Contrast',
    scheduled_at: '2025-12-25T10:00:00Z',
    patient_national_id: '1234567890123456',
    patient_name: 'John Doe',
    gender: 'M',
    birth_date: '1990-01-01',
    medical_record_number: 'MRN123456',
    ihs_number: 'P02478375538'
  };
  
  const validator = new UnifiedSchemaValidator();
  const result = validator.validateAndNormalize(sampleData);
  
  console.log(`Valid: ${result.isValid}`);
  console.log(`Normalized data: ${JSON.stringify(result.normalizedData, null, 2)}`);
  if (result.errors.length > 0) {
    console.log(`Errors: ${result.errors}`);
  }
}