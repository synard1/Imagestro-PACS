"""
HL7 Order Service
Integration layer between HL7 ORM messages and Orders table
"""

import logging
from datetime import datetime
from typing import Optional, Dict, Any, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import text
import uuid

from app.utils.audit_helper import AuditHelper
from app.services.order_notification_service import OrderNotificationService

logger = logging.getLogger(__name__)


class HL7OrderService:
    """
    Service for managing orders from HL7 ORM messages
    Integrates HL7 data with the orders table
    """

    def __init__(self, db: Session):
        self.db = db

    async def create_order_from_hl7(
        self,
        hl7_message_id: str,
        parsed_data: Dict[str, Any],
        hl7_source_system: str
    ) -> Optional[str]:
        """
        Create a new order from HL7 ORM message

        Args:
            hl7_message_id: UUID of the HL7 message
            parsed_data: Parsed HL7 message data
            hl7_source_system: Source system identifier

        Returns:
            Order UUID if successful, None otherwise
        """
        try:
            logger.info(f"Creating order from HL7 message: {hl7_message_id}")

            # Extract ORC (Order Control) segment
            orc = parsed_data.get('ORC', {})
            placer_order_number = orc.get('placer_order_number')
            order_control = orc.get('order_control')  # NW, CA, DC, SC, etc.

            # Extract PID (Patient Identification) segment
            pid = parsed_data.get('PID', {})
            patient_id = pid.get('patient_id')
            patient_name = pid.get('patient_name', '')
            patient_national_id = pid.get('patient_national_id')
            medical_record_number = pid.get('medical_record_number')
            gender = pid.get('gender')
            birth_date = pid.get('birth_date')
            address = pid.get('address')
            phone = pid.get('phone')

            # Extract OBR (Observation Request) segment
            obr = parsed_data.get('OBR', {})
            accession_number = obr.get('filler_order_number') or self._generate_accession_number()
            procedure_code = obr.get('universal_service_id_code')
            procedure_name = obr.get('universal_service_id_text')
            procedure_description = obr.get('universal_service_id_text')
            scheduled_datetime = obr.get('observation_datetime')
            priority = obr.get('priority', 'ROUTINE')
            ordering_provider = obr.get('ordering_provider_name')
            reason_for_study = obr.get('reason_for_study')

            # Extract modality from procedure code or use default
            modality = self._extract_modality(procedure_code, procedure_name)

            # Check if order already exists by placer_order_number
            if placer_order_number:
                existing_order = await self.get_order_by_placer_number(placer_order_number)
                if existing_order:
                    logger.warning(f"Order already exists with placer_order_number: {placer_order_number}")
                    return existing_order.get('id')

            # Generate order_number (internal)
            order_number = self._generate_order_number()

            # Get organization ID (default or from context)
            org_id = parsed_data.get('org_id') or self._get_default_org_id()

            # Insert order
            query = text("""
                INSERT INTO orders (
                    id, org_id, patient_id, patient_name, accession_number,
                    order_number, modality, procedure_code, procedure_name, procedure_description,
                    status, order_status, scheduled_at, priority,
                    patient_national_id, medical_record_number, gender, birth_date,
                    patient_address, patient_phone,
                    hl7_message_id, placer_order_number, order_control,
                    hl7_source_system, ordering_physician_name, clinical_notes,
                    created_at, updated_at
                ) VALUES (
                    :id, :org_id, :patient_id, :patient_name, :accession_number,
                    :order_number, :modality, :procedure_code, :procedure_name, :procedure_description,
                    :status, :order_status, :scheduled_at, :priority,
                    :patient_national_id, :medical_record_number, :gender, :birth_date,
                    :patient_address, :patient_phone,
                    :hl7_message_id, :placer_order_number, :order_control,
                    :hl7_source_system, :ordering_physician_name, :clinical_notes,
                    NOW(), NOW()
                )
                RETURNING id
            """)

            order_id = str(uuid.uuid4())

            result = self.db.execute(query, {
                'id': order_id,
                'org_id': org_id,
                'patient_id': patient_id or f"HL7-{medical_record_number or patient_national_id}",
                'patient_name': patient_name,
                'accession_number': accession_number,
                'order_number': order_number,
                'modality': modality,
                'procedure_code': procedure_code,
                'procedure_name': procedure_name,
                'procedure_description': procedure_description,
                'status': 'CREATED',
                'order_status': 'CREATED',
                'scheduled_at': scheduled_datetime,
                'priority': self._map_priority(priority),
                'patient_national_id': patient_national_id,
                'medical_record_number': medical_record_number,
                'gender': gender,
                'birth_date': birth_date,
                'patient_address': address,
                'patient_phone': phone,
                'hl7_message_id': hl7_message_id,
                'placer_order_number': placer_order_number,
                'order_control': order_control,
                'hl7_source_system': hl7_source_system,
                'ordering_physician_name': ordering_provider,
                'clinical_notes': reason_for_study
            })

            self.db.commit()

            logger.info(f"Order created successfully: {order_id}, Accession: {accession_number}")

            # AUDIT LOG: Order created
            try:
                await AuditHelper.log_order_created(
                    db=self.db,
                    order_id=order_id,
                    request=None,  # HL7 integration has no HTTP request
                    details={
                        'accession_number': accession_number,
                        'order_number': order_number,
                        'modality': modality,
                        'procedure_name': procedure_name,
                        'hl7_message_id': hl7_message_id,
                        'placer_order_number': placer_order_number,
                        'order_control': order_control,
                        'hl7_source_system': hl7_source_system,
                        'source': 'HL7_ORM'
                    },
                    patient_id=patient_id
                )
            except Exception as audit_error:
                logger.warning(f"Audit log failed for order creation: {audit_error}")

            # Note: Notifications are now handled by frontend stagnant order detection
            # and worklist service when order is scheduled
            # Disabled here to prevent duplicate notifications
            # try:
            #     notifier = OrderNotificationService(self.db)
            #     notifier.notify_new_order(
            #         order_id=order_id,
            #         context={...}
            #     )
            # except Exception as notify_error:
            #     logger.warning(f"Order notification failed: {notify_error}")

            return order_id

        except Exception as e:
            logger.error(f"Failed to create order from HL7: {str(e)}")
            self.db.rollback()
            raise

    async def update_order_from_hl7(
        self,
        hl7_message_id: str,
        parsed_data: Dict[str, Any],
        hl7_source_system: str
    ) -> bool:
        """
        Update existing order from HL7 ORM message

        Args:
            hl7_message_id: UUID of the HL7 message
            parsed_data: Parsed HL7 message data
            hl7_source_system: Source system identifier

        Returns:
            True if successful, False otherwise
        """
        try:
            logger.info(f"Updating order from HL7 message: {hl7_message_id}")

            # Extract order identifiers
            orc = parsed_data.get('ORC', {})
            placer_order_number = orc.get('placer_order_number')
            order_control = orc.get('order_control')

            if not placer_order_number:
                logger.error("Cannot update order: placer_order_number not provided")
                return False

            # Find existing order
            existing_order = await self.get_order_by_placer_number(placer_order_number)
            if not existing_order:
                logger.error(f"Order not found with placer_order_number: {placer_order_number}")
                return False

            # Extract updated data
            obr = parsed_data.get('OBR', {})
            pid = parsed_data.get('PID', {})

            # Build update query
            query = text("""
                UPDATE orders
                SET
                    patient_name = COALESCE(:patient_name, patient_name),
                    procedure_name = COALESCE(:procedure_name, procedure_name),
                    procedure_description = COALESCE(:procedure_description, procedure_description),
                    scheduled_at = COALESCE(:scheduled_at, scheduled_at),
                    priority = COALESCE(:priority, priority),
                    patient_national_id = COALESCE(:patient_national_id, patient_national_id),
                    gender = COALESCE(:gender, gender),
                    birth_date = COALESCE(:birth_date, birth_date),
                    patient_address = COALESCE(:patient_address, patient_address),
                    patient_phone = COALESCE(:patient_phone, patient_phone),
                    ordering_physician_name = COALESCE(:ordering_physician_name, ordering_physician_name),
                    clinical_notes = COALESCE(:clinical_notes, clinical_notes),
                    hl7_message_id = :hl7_message_id,
                    order_control = :order_control,
                    hl7_processed_at = NOW(),
                    updated_at = NOW()
                WHERE placer_order_number = :placer_order_number
            """)

            self.db.execute(query, {
                'patient_name': pid.get('patient_name'),
                'procedure_name': obr.get('universal_service_id_text'),
                'procedure_description': obr.get('universal_service_id_text'),
                'scheduled_at': obr.get('observation_datetime'),
                'priority': self._map_priority(obr.get('priority')),
                'patient_national_id': pid.get('patient_national_id'),
                'gender': pid.get('gender'),
                'birth_date': pid.get('birth_date'),
                'patient_address': pid.get('address'),
                'patient_phone': pid.get('phone'),
                'ordering_physician_name': obr.get('ordering_provider_name'),
                'clinical_notes': obr.get('reason_for_study'),
                'hl7_message_id': hl7_message_id,
                'order_control': order_control,
                'placer_order_number': placer_order_number
            })

            self.db.commit()

            logger.info(f"Order updated successfully: {placer_order_number}")

            # AUDIT LOG: Order updated
            try:
                await AuditHelper.log_order_updated(
                    db=self.db,
                    order_id=existing_order['id'],
                    request=None,  # HL7 integration has no HTTP request
                    details={
                        'placer_order_number': placer_order_number,
                        'order_control': order_control,
                        'hl7_message_id': hl7_message_id,
                        'updated_fields': {
                            'patient_name': pid.get('patient_name'),
                            'procedure_name': obr.get('universal_service_id_text'),
                            'scheduled_at': str(obr.get('observation_datetime')),
                            'priority': self._map_priority(obr.get('priority'))
                        },
                        'source': 'HL7_ORM_UPDATE'
                    },
                    patient_id=existing_order.get('patient_id')
                )
            except Exception as audit_error:
                logger.warning(f"Audit log failed for order update: {audit_error}")

            return True

        except Exception as e:
            logger.error(f"Failed to update order from HL7: {str(e)}")
            self.db.rollback()
            raise

    async def cancel_order_from_hl7(
        self,
        hl7_message_id: str,
        parsed_data: Dict[str, Any],
        reason: Optional[str] = None
    ) -> bool:
        """
        Cancel order from HL7 ORM message

        Args:
            hl7_message_id: UUID of the HL7 message
            parsed_data: Parsed HL7 message data
            reason: Cancellation reason

        Returns:
            True if successful, False otherwise
        """
        try:
            logger.info(f"Cancelling order from HL7 message: {hl7_message_id}")

            # Extract order identifiers
            orc = parsed_data.get('ORC', {})
            placer_order_number = orc.get('placer_order_number')

            if not placer_order_number:
                logger.error("Cannot cancel order: placer_order_number not provided")
                return False

            # Find existing order
            existing_order = await self.get_order_by_placer_number(placer_order_number)
            if not existing_order:
                logger.error(f"Order not found with placer_order_number: {placer_order_number}")
                return False

            # Cancel order
            query = text("""
                UPDATE orders
                SET
                    status = 'CANCELLED',
                    order_status = 'CANCELLED',
                    cancelled_at = NOW(),
                    cancelled_by = :cancelled_by,
                    cancelled_reason = :cancelled_reason,
                    hl7_message_id = :hl7_message_id,
                    order_control = 'CA',
                    updated_at = NOW()
                WHERE placer_order_number = :placer_order_number
            """)

            self.db.execute(query, {
                'cancelled_by': 'HL7 System',
                'cancelled_reason': reason or 'Cancelled via HL7 ORM message',
                'hl7_message_id': hl7_message_id,
                'placer_order_number': placer_order_number
            })

            self.db.commit()

            logger.info(f"Order cancelled successfully: {placer_order_number}")

            # AUDIT LOG: Order cancelled
            try:
                await AuditHelper.log_order_deleted(
                    db=self.db,
                    order_id=existing_order['id'],
                    request=None,  # HL7 integration has no HTTP request
                    details={
                        'placer_order_number': placer_order_number,
                        'cancelled_reason': reason or 'Cancelled via HL7 ORM message',
                        'hl7_message_id': hl7_message_id,
                        'cancelled_by': 'HL7 System',
                        'source': 'HL7_ORM_CANCEL'
                    }
                )
            except Exception as audit_error:
                logger.warning(f"Audit log failed for order cancellation: {audit_error}")

            return True

        except Exception as e:
            logger.error(f"Failed to cancel order from HL7: {str(e)}")
            self.db.rollback()
            raise

    async def get_order_by_placer_number(self, placer_order_number: str) -> Optional[Dict[str, Any]]:
        """
        Get order by placer_order_number

        Args:
            placer_order_number: Placer order number from HL7

        Returns:
            Order dict if found, None otherwise
        """
        try:
            query = text("""
                SELECT
                    id, org_id, patient_id, patient_name, accession_number,
                    order_number, modality, procedure_name, status, order_status,
                    placer_order_number, filler_order_number, order_control,
                    hl7_message_id, hl7_source_system, created_at
                FROM orders
                WHERE placer_order_number = :placer_order_number
                LIMIT 1
            """)

            result = self.db.execute(query, {'placer_order_number': placer_order_number})
            row = result.fetchone()

            if row:
                return {
                    'id': str(row[0]),
                    'org_id': str(row[1]),
                    'patient_id': row[2],
                    'patient_name': row[3],
                    'accession_number': row[4],
                    'order_number': row[5],
                    'modality': row[6],
                    'procedure_name': row[7],
                    'status': row[8],
                    'order_status': row[9],
                    'placer_order_number': row[10],
                    'filler_order_number': row[11],
                    'order_control': row[12],
                    'hl7_message_id': str(row[13]) if row[13] else None,
                    'hl7_source_system': row[14],
                    'created_at': row[15].isoformat() if row[15] else None
                }

            return None

        except Exception as e:
            logger.error(f"Failed to get order by placer number: {str(e)}")
            return None

    async def get_order_by_accession_number(self, accession_number: str) -> Optional[Dict[str, Any]]:
        """
        Get order by accession_number

        Args:
            accession_number: Accession number

        Returns:
            Order dict if found, None otherwise
        """
        try:
            query = text("""
                SELECT
                    id, org_id, patient_id, patient_name, accession_number,
                    order_number, modality, procedure_name, status, order_status,
                    placer_order_number, filler_order_number, order_control,
                    hl7_message_id, hl7_source_system, created_at
                FROM orders
                WHERE accession_number = :accession_number
                LIMIT 1
            """)

            result = self.db.execute(query, {'accession_number': accession_number})
            row = result.fetchone()

            if row:
                return {
                    'id': str(row[0]),
                    'org_id': str(row[1]),
                    'patient_id': row[2],
                    'patient_name': row[3],
                    'accession_number': row[4],
                    'order_number': row[5],
                    'modality': row[6],
                    'procedure_name': row[7],
                    'status': row[8],
                    'order_status': row[9],
                    'placer_order_number': row[10],
                    'filler_order_number': row[11],
                    'order_control': row[12],
                    'hl7_message_id': str(row[13]) if row[13] else None,
                    'hl7_source_system': row[14],
                    'created_at': row[15].isoformat() if row[15] else None
                }

            return None

        except Exception as e:
            logger.error(f"Failed to get order by accession number: {str(e)}")
            return None

    def _generate_accession_number(self) -> str:
        """Generate unique accession number"""
        timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
        random_suffix = str(uuid.uuid4())[:6].upper()
        return f"ACC{timestamp}{random_suffix}"

    def _generate_order_number(self) -> str:
        """Generate unique order number"""
        timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
        random_suffix = str(uuid.uuid4())[:6].upper()
        return f"ORD{timestamp}{random_suffix}"

    def _get_default_org_id(self) -> str:
        """Get default organization ID"""
        # Try to get from database or use default UUID
        try:
            query = text("SELECT id FROM organizations LIMIT 1")
            result = self.db.execute(query)
            row = result.fetchone()
            if row:
                return str(row[0])
        except Exception:
            pass

        # Return default UUID if no org found
        return "00000000-0000-0000-0000-000000000001"

    def _extract_modality(self, procedure_code: Optional[str], procedure_name: Optional[str]) -> str:
        """
        Extract modality from procedure code or name

        Args:
            procedure_code: Procedure code
            procedure_name: Procedure name

        Returns:
            Modality code (CR, CT, MR, US, etc.)
        """
        # Check procedure code first
        if procedure_code:
            code_upper = procedure_code.upper()
            if 'CR' in code_upper or 'XR' in code_upper:
                return 'CR'
            elif 'CT' in code_upper:
                return 'CT'
            elif 'MR' in code_upper or 'MRI' in code_upper:
                return 'MR'
            elif 'US' in code_upper or 'ULTRA' in code_upper:
                return 'US'
            elif 'NM' in code_upper:
                return 'NM'
            elif 'PT' in code_upper:
                return 'PT'
            elif 'RF' in code_upper:
                return 'RF'
            elif 'MG' in code_upper or 'MAMMO' in code_upper:
                return 'MG'

        # Check procedure name
        if procedure_name:
            name_upper = procedure_name.upper()
            if 'X-RAY' in name_upper or 'XRAY' in name_upper or 'RONTGEN' in name_upper:
                return 'CR'
            elif 'CT' in name_upper or 'SCAN' in name_upper:
                return 'CT'
            elif 'MRI' in name_upper or 'MAGNETIC' in name_upper:
                return 'MR'
            elif 'ULTRASOUND' in name_upper or 'USG' in name_upper:
                return 'US'
            elif 'NUCLEAR' in name_upper:
                return 'NM'
            elif 'FLUORO' in name_upper:
                return 'RF'
            elif 'MAMMO' in name_upper:
                return 'MG'

        # Default to Other
        return 'OT'

    def _map_priority(self, hl7_priority: Optional[str]) -> str:
        """
        Map HL7 priority to system priority

        Args:
            hl7_priority: HL7 priority code (S=STAT, A=ASAP, R=ROUTINE, etc.)

        Returns:
            System priority string
        """
        if not hl7_priority:
            return 'ROUTINE'

        priority_map = {
            'S': 'STAT',
            'A': 'ASAP',
            'R': 'ROUTINE',
            'P': 'ROUTINE',
            'T': 'ROUTINE',
            'STAT': 'STAT',
            'URGENT': 'STAT',
            'ASAP': 'ASAP',
            'ROUTINE': 'ROUTINE'
        }

        return priority_map.get(hl7_priority.upper(), 'ROUTINE')
