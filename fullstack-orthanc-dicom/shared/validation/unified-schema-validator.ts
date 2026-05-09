/**
 * Unified Schema Validator - TypeScript Implementation
 * Provides validation and normalization for both order-management and accession-api services
 */

import fs from 'fs';
import path from 'path';

// Define validation result interface
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  normalizedData?: any;
}

// Define field mapping interface
export interface FieldMapping {
  [key: string]: string;
}

export class UnifiedSchemaValidator {
  private schema: any;
  private orderFieldMapping: FieldMapping;
  private accessionFieldMapping: FieldMapping;

  constructor() {
    this.loadSchema();
    this.initializeFieldMappings();
  }

  private loadSchema(): void {
    try {
      // Use import.meta.url for ES modules
      const currentDir = path.dirname(new URL(import.meta.url).pathname);
      const schemaPath = path.join(currentDir, '..', 'schemas', 'unified-schema.json');
      const schemaContent = fs.readFileSync(schemaPath, 'utf8');
      this.schema = JSON.parse(schemaContent);
    } catch (error) {
      throw new Error(`Failed to load unified schema: ${error}`);
    }
  }

  private initializeFieldMappings(): void {
    // Order management field mapping
    this.orderFieldMapping = {
      'patient_nik': 'patient_national_id',
      'patient_name': 'patient_name',
      'patient_birth_date': 'patient_birth_date',
      'patient_sex': 'gender',
      'patient_ihs_number': 'patient_ihs_number',
      'medical_record_number': 'medical_record_number',
      'modality': 'modality',
      'procedure_code': 'procedure_code',
      'procedure_name': 'procedure_name',
      'scheduled_at': 'scheduled_at',
      'referring_physician': 'referring_physician',
      'facility_code': 'facility_code',
      'priority': 'priority',
      'notes': 'notes'
    };

    // Accession API field mapping
    this.accessionFieldMapping = {
      'patient.id': 'patient_national_id',
      'patient.name': 'patient_name',
      'patient.birthDate': 'patient_birth_date',
      'patient.sex': 'gender',
      'patient.ihs_number': 'patient_ihs_number',
      'patient.medical_record_number': 'medical_record_number',
      'modality': 'modality',
      'procedure_code': 'procedure_code',
      'procedure_name': 'procedure_name',
      'scheduled_at': 'scheduled_at',
      'referring_physician': 'referring_physician',
      'facility_code': 'facility_code',
      'priority': 'priority',
      'note': 'notes'
    };
  }

  /**
   * Transform order data to unified schema format
   */
  public transformOrderData(data: any): any {
    const transformed: any = {};
    
    for (const originalField in this.orderFieldMapping) {
      const unifiedField = this.orderFieldMapping[originalField];
      if (data.hasOwnProperty(originalField)) {
        transformed[unifiedField] = data[originalField];
      }
    }

    // Handle special transformations
    if (transformed.gender) {
      transformed.gender = this.normalizeGender(transformed.gender);
    }

    if (transformed.patient_birth_date) {
      transformed.patient_birth_date = this.normalizeBirthDate(transformed.patient_birth_date);
    }

    return transformed;
  }

  /**
   * Transform accession data to unified schema format
   */
  public transformAccessionData(data: any): any {
    const transformed: any = {};
    
    // Handle nested patient object
    if (data.patient) {
      transformed.patient_national_id = data.patient.id;
      transformed.patient_name = data.patient.name;
      transformed.patient_birth_date = data.patient.birthDate;
      transformed.gender = data.patient.sex;
      transformed.patient_ihs_number = data.patient.ihs_number;
      transformed.medical_record_number = data.patient.medical_record_number;
    }

    // Handle direct fields
    transformed.modality = data.modality;
    transformed.procedure_code = data.procedure_code;
    transformed.procedure_name = data.procedure_name;
    transformed.scheduled_at = data.scheduled_at;
    transformed.referring_physician = data.referring_physician;
    transformed.facility_code = data.facility_code;
    transformed.priority = data.priority;
    transformed.notes = data.note;

    // Handle special transformations
    if (transformed.gender) {
      transformed.gender = this.normalizeGender(transformed.gender);
    }

    if (transformed.patient_birth_date) {
      transformed.patient_birth_date = this.normalizeBirthDate(transformed.patient_birth_date);
    }

    return transformed;
  }

  /**
   * Validate and normalize data against unified schema
   */
  public validateAndNormalize(data: any, dataType: 'order' | 'accession' = 'order'): ValidationResult {
    const errors: string[] = [];
    
    try {
      // Transform data based on type
      let normalizedData: any;
      if (dataType === 'order') {
        normalizedData = this.transformOrderData(data);
      } else {
        normalizedData = this.transformAccessionData(data);
      }

      // Validate required fields
      const requiredFields = this.schema.required || [];
      for (const field of requiredFields) {
        if (!normalizedData[field] || normalizedData[field] === '') {
          errors.push(`Required field '${field}' is missing or empty`);
        }
      }

      // Validate field formats
      this.validateFieldFormats(normalizedData, errors);

      return {
        isValid: errors.length === 0,
        errors,
        normalizedData: errors.length === 0 ? normalizedData : undefined
      };
    } catch (error) {
      errors.push(`Validation error: ${error}`);
      return {
        isValid: false,
        errors
      };
    }
  }

  private validateFieldFormats(data: any, errors: string[]): void {
    // Validate NIK format (16 digits)
    if (data.patient_national_id && !/^\d{16}$/.test(data.patient_national_id)) {
      errors.push('Patient national ID must be 16 digits');
    }

    // Validate IHS number format if present
    if (data.patient_ihs_number && !/^\d{13}$/.test(data.patient_ihs_number)) {
      errors.push('Patient IHS number must be 13 digits');
    }

    // Validate gender
    if (data.gender && ['M', 'F', 'O', 'U'].indexOf(data.gender) === -1) {
      errors.push('Gender must be M, F, O, or U');
    }

    // Validate birth date
    if (data.patient_birth_date) {
      const birthDate = new Date(data.patient_birth_date);
      if (isNaN(birthDate.getTime())) {
        errors.push('Invalid birth date format');
      } else if (birthDate > new Date()) {
        errors.push('Birth date cannot be in the future');
      }
    }

    // Validate modality
    const validModalities = ['CT', 'MR', 'US', 'XR', 'DX', 'CR', 'MG', 'NM', 'PT', 'RF', 'SC'];
    if (data.modality && validModalities.indexOf(data.modality) === -1) {
      errors.push(`Invalid modality. Must be one of: ${validModalities.join(', ')}`);
    }

    // Validate scheduled_at
    if (data.scheduled_at) {
      const scheduledDate = new Date(data.scheduled_at);
      if (isNaN(scheduledDate.getTime())) {
        errors.push('Invalid scheduled date format');
      }
    }
  }

  private normalizeGender(gender: string): string {
    const genderMap: { [key: string]: string } = {
      'male': 'M',
      'female': 'F',
      'other': 'O',
      'unknown': 'U',
      'M': 'M',
      'F': 'F',
      'O': 'O',
      'U': 'U',
      'L': 'M', // Laki-laki
      'P': 'F'  // Perempuan
    };
    
    return genderMap[gender] || 'U';
  }

  private normalizeBirthDate(birthDate: string): string {
    try {
      const date = new Date(birthDate);
      return date.toISOString().split('T')[0]; // Return YYYY-MM-DD format
    } catch {
      return birthDate; // Return original if parsing fails
    }
  }
}

/**
 * Convenience function for order data validation
 */
export function validateAndNormalizeOrderData(data: any): ValidationResult {
  const validator = new UnifiedSchemaValidator();
  return validator.validateAndNormalize(data, 'order');
}

/**
 * Convenience function for accession data validation
 */
export function validateAndNormalizeAccessionData(data: any): ValidationResult {
  const validator = new UnifiedSchemaValidator();
  return validator.validateAndNormalize(data, 'accession');
}