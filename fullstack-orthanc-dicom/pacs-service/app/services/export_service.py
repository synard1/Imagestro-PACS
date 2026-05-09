"""
Export Service
Logic for exporting master data to Excel
"""
import openpyxl
import io
import logging
from typing import Optional
from sqlalchemy.orm import Session, joinedload
from app.models.unified_integration import UnifiedProcedureMapping, UnifiedDoctorMapping
from app.models.dicom_node import DicomNode
from app.models.audit_log import AuditLog

logger = logging.getLogger(__name__)

class ExportService:
    @staticmethod
    def _format_key(key: str) -> str:
        """Convert snake_case to Human Readable Title Case"""
        return key.replace('_', ' ').title()

    @staticmethod
    def _process_export_data(items: list, extra_exclusions: list = None) -> list:
        """
        Format data for export:
        1. Add 'No' column (row number)
        2. Filter excluded fields
        3. Rename keys to Human Readable
        """
        exclusions = {'id', 'created_at', 'updated_at', 'created_by', 'updated_by'}
        if extra_exclusions:
            exclusions.update(extra_exclusions)
            
        formatted = []
        for idx, item in enumerate(items, 1):
            new_item = {'No': idx}
            for k, v in item.items():
                if k not in exclusions:
                    new_key = ExportService._format_key(k)
                    new_item[new_key] = v
            formatted.append(new_item)
        return formatted

    @staticmethod
    def export_to_excel(data: list, sheet_name: str) -> bytes:
        """Generic method to export list of dicts to Excel bytes"""
        workbook = openpyxl.Workbook()
        sheet = workbook.active
        sheet.title = sheet_name

        if data:
            # Get headers from the first dictionary
            headers = list(data[0].keys())
            sheet.append(headers)
            
            # Write data
            for item in data:
                row_data = [item.get(header) for header in headers]
                sheet.append(row_data)
            
        output = io.BytesIO()
        workbook.save(output)
        return output.getvalue()

    @staticmethod
    def export_procedure_mappings(db: Session) -> Optional[bytes]:
        """Export all unified procedure mappings"""
        mappings = db.query(UnifiedProcedureMapping).options(joinedload(UnifiedProcedureMapping.external_system)).all()
        if not mappings:
            return None
            
        data = []
        for m in mappings:
            item = m.to_dict()
            # Replace ID with Name
            item['external_system'] = m.external_system.name if m.external_system else 'Unknown'
            # Remove ID column
            if 'external_system_id' in item:
                del item['external_system_id']
            data.append(item)
            
        formatted_data = ExportService._process_export_data(data)
        return ExportService.export_to_excel(formatted_data, "Procedure Mappings")

    @staticmethod
    def export_doctor_mappings(db: Session) -> Optional[bytes]:
        """Export all unified doctor mappings"""
        mappings = db.query(UnifiedDoctorMapping).options(joinedload(UnifiedDoctorMapping.external_system)).all()
        if not mappings:
            return None
            
        data = []
        for m in mappings:
            item = m.to_dict()
            # Replace ID with Name
            item['external_system'] = m.external_system.name if m.external_system else 'Unknown'
            # Remove ID column
            if 'external_system_id' in item:
                del item['external_system_id']
            data.append(item)
            
        formatted_data = ExportService._process_export_data(data)
        return ExportService.export_to_excel(formatted_data, "Doctor Mappings")

    @staticmethod
    def export_modalities(db: Session) -> Optional[bytes]:
        """Export all DICOM nodes of type modality"""
        nodes = db.query(DicomNode).filter(DicomNode.node_type == 'modality').all()
        if not nodes:
            return None
        data = []
        for n in nodes:
            data.append({
                'ae_title': n.ae_title,
                'name': n.name,
                'description': n.description,
                'host': n.host,
                'port': n.port,
                'modality': n.modality,
                'is_active': n.is_active
            })
        formatted_data = ExportService._process_export_data(data)
        return ExportService.export_to_excel(formatted_data, "Modalities")

    @staticmethod
    def export_insurance(db: Session) -> Optional[bytes]:
        """Export insurance data (currently placeholder)"""
        # No insurance model exists yet
        return None

    @staticmethod
    def export_audit_logs(db: Session, limit: int = 1000) -> bytes:
        """
        Export recent audit logs to Excel
        
        Args:
            db: Database session
            limit: Maximum number of records to export (default 1000)
        """
        logs = db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit).all()
        data = []
        for log in logs:
            row = log.to_dict()
            # Flatten details for Excel readability if needed, or keep as string
            if row.get('details'):
                import json
                row['details'] = json.dumps(row['details'])
            data.append(row)
            
        return ExportService.export_to_excel(data, "Audit Logs")

