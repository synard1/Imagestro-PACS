"""
FHIR Base Service

Core CRUD operations for FHIR R4 resources with versioning, search, and linking support
"""

from typing import Dict, Any, Optional, List, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import desc, and_, or_, text
from datetime import datetime
import uuid
import logging

from app.models.fhir_resource import FHIRResource, FHIRSearchParam, FHIRResourceLink, FHIRConfig
from fhir.resources.fhirtypes import FHIRAbstractModel

logger = logging.getLogger(__name__)


class FHIRBaseService:
    """
    Base service for FHIR R4 resource operations
    Provides CRUD operations with versioning, search parameters, and resource linking
    """

    def __init__(self, db: Session):
        self.db = db

    # ========================================================================
    # CREATE Operations
    # ========================================================================

    def create_resource(
        self,
        resource_type: str,
        resource_json: Dict[str, Any],
        resource_id: Optional[str] = None,
        author: Optional[str] = None,
        source_system: Optional[str] = None,
        hl7_message_id: Optional[str] = None,
        order_id: Optional[str] = None,
        patient_external_id: Optional[str] = None
    ) -> FHIRResource:
        """
        Create a new FHIR resource

        Args:
            resource_type: FHIR resource type (Patient, ServiceRequest, etc.)
            resource_json: FHIR resource as dict
            resource_id: Optional logical resource ID (auto-generated if not provided)
            author: Who created the resource
            source_system: Source system identifier
            hl7_message_id: Link to source HL7 message
            order_id: Link to orders table
            patient_external_id: External patient identifier

        Returns:
            Created FHIRResource instance
        """
        try:
            # Generate resource ID if not provided
            if not resource_id:
                resource_id = str(uuid.uuid4())

            # Ensure resource_json has required fields
            if 'resourceType' not in resource_json:
                resource_json['resourceType'] = resource_type
            if 'id' not in resource_json:
                resource_json['id'] = resource_id

            # Create resource
            fhir_resource = FHIRResource(
                resource_type=resource_type,
                resource_id=resource_id,
                resource_json=resource_json,
                author=author,
                source_system=source_system,
                hl7_message_id=uuid.UUID(hl7_message_id) if hl7_message_id else None,
                order_id=uuid.UUID(order_id) if order_id else None,
                patient_external_id=patient_external_id
            )

            self.db.add(fhir_resource)
            self.db.flush()  # Flush to get version_id from trigger

            logger.info(f"Created FHIR resource: {resource_type}/{resource_id} version {fhir_resource.version_id}")

            return fhir_resource

        except Exception as e:
            logger.error(f"Failed to create FHIR resource: {str(e)}")
            raise

    def create_search_param(
        self,
        resource_fhir_id: str,
        param_name: str,
        param_value: Optional[str] = None,
        param_type: str = "string",
        reference_type: Optional[str] = None,
        reference_id: Optional[str] = None,
        date_value: Optional[datetime] = None,
        number_value: Optional[float] = None
    ) -> FHIRSearchParam:
        """
        Create a search parameter for a FHIR resource

        Args:
            resource_fhir_id: UUID of the FHIRResource
            param_name: Search parameter name (e.g., "identifier", "name")
            param_value: Text value
            param_type: Parameter type (string, token, reference, date, number)
            reference_type: For references, the resource type
            reference_id: For references, the resource ID
            date_value: For dates, the parsed datetime
            number_value: For numbers, the numeric value

        Returns:
            Created FHIRSearchParam instance
        """
        try:
            search_param = FHIRSearchParam(
                resource_fhir_id=uuid.UUID(resource_fhir_id),
                param_name=param_name,
                param_value=param_value,
                param_type=param_type,
                reference_type=reference_type,
                reference_id=reference_id,
                date_value=date_value,
                number_value=number_value
            )

            self.db.add(search_param)
            return search_param

        except Exception as e:
            logger.error(f"Failed to create search parameter: {str(e)}")
            raise

    def create_resource_link(
        self,
        source_resource_id: str,
        source_resource_type: str,
        target_resource_id: str,
        target_resource_type: str,
        link_type: str
    ) -> FHIRResourceLink:
        """
        Create a link between two FHIR resources

        Args:
            source_resource_id: UUID of source FHIRResource
            source_resource_type: Type of source resource
            target_resource_id: UUID of target FHIRResource
            target_resource_type: Type of target resource
            link_type: Type of link (e.g., "subject", "encounter", "performer")

        Returns:
            Created FHIRResourceLink instance
        """
        try:
            link = FHIRResourceLink(
                source_resource_id=uuid.UUID(source_resource_id),
                source_resource_type=source_resource_type,
                target_resource_id=uuid.UUID(target_resource_id),
                target_resource_type=target_resource_type,
                link_type=link_type
            )

            self.db.add(link)
            logger.info(f"Created link: {source_resource_type} --{link_type}--> {target_resource_type}")
            return link

        except Exception as e:
            logger.error(f"Failed to create resource link: {str(e)}")
            raise

    # ========================================================================
    # READ Operations
    # ========================================================================

    def get_resource(
        self,
        resource_type: str,
        resource_id: str,
        version_id: Optional[int] = None
    ) -> Optional[FHIRResource]:
        """
        Get a FHIR resource by type and ID

        Args:
            resource_type: FHIR resource type
            resource_id: Logical resource ID
            version_id: Specific version (latest if not provided)

        Returns:
            FHIRResource instance or None
        """
        try:
            query = self.db.query(FHIRResource).filter(
                FHIRResource.resource_type == resource_type,
                FHIRResource.resource_id == resource_id,
                FHIRResource.is_deleted == False
            )

            if version_id:
                query = query.filter(FHIRResource.version_id == version_id)
            else:
                query = query.order_by(desc(FHIRResource.version_id))

            return query.first()

        except Exception as e:
            logger.error(f"Failed to get FHIR resource: {str(e)}")
            return None

    def get_resource_by_db_id(self, db_id: str) -> Optional[FHIRResource]:
        """
        Get a FHIR resource by database UUID

        Args:
            db_id: Database UUID

        Returns:
            FHIRResource instance or None
        """
        try:
            return self.db.query(FHIRResource).filter(
                FHIRResource.id == uuid.UUID(db_id)
            ).first()
        except Exception as e:
            logger.error(f"Failed to get resource by DB ID: {str(e)}")
            return None

    def get_resource_history(
        self,
        resource_type: str,
        resource_id: str,
        limit: int = 10,
        offset: int = 0
    ) -> Tuple[List[FHIRResource], int]:
        """
        Get version history for a FHIR resource

        Args:
            resource_type: FHIR resource type
            resource_id: Logical resource ID
            limit: Maximum number of versions to return
            offset: Offset for pagination

        Returns:
            Tuple of (list of FHIRResource versions, total count)
        """
        try:
            query = self.db.query(FHIRResource).filter(
                FHIRResource.resource_type == resource_type,
                FHIRResource.resource_id == resource_id
            ).order_by(desc(FHIRResource.version_id))

            total = query.count()
            resources = query.limit(limit).offset(offset).all()

            return resources, total

        except Exception as e:
            logger.error(f"Failed to get resource history: {str(e)}")
            return [], 0

    # ========================================================================
    # UPDATE Operations
    # ========================================================================

    def update_resource(
        self,
        resource_type: str,
        resource_id: str,
        resource_json: Dict[str, Any],
        author: Optional[str] = None
    ) -> Optional[FHIRResource]:
        """
        Update a FHIR resource (creates new version)

        Args:
            resource_type: FHIR resource type
            resource_id: Logical resource ID
            resource_json: Updated FHIR resource as dict
            author: Who updated the resource

        Returns:
            New FHIRResource version or None
        """
        try:
            # Get current version
            current = self.get_resource(resource_type, resource_id)
            if not current:
                logger.warning(f"Resource not found for update: {resource_type}/{resource_id}")
                return None

            # Create new version with same metadata
            new_version = FHIRResource(
                resource_type=resource_type,
                resource_id=resource_id,
                resource_json=resource_json,
                author=author or current.author,
                source_system=current.source_system,
                hl7_message_id=current.hl7_message_id,
                order_id=current.order_id,
                patient_external_id=current.patient_external_id
            )

            self.db.add(new_version)
            self.db.flush()  # Flush to get version_id from trigger

            logger.info(f"Updated FHIR resource: {resource_type}/{resource_id} to version {new_version.version_id}")

            return new_version

        except Exception as e:
            logger.error(f"Failed to update FHIR resource: {str(e)}")
            raise

    # ========================================================================
    # DELETE Operations
    # ========================================================================

    def delete_resource(
        self,
        resource_type: str,
        resource_id: str,
        author: Optional[str] = None
    ) -> bool:
        """
        Delete a FHIR resource (soft delete - creates deleted version)

        Args:
            resource_type: FHIR resource type
            resource_id: Logical resource ID
            author: Who deleted the resource

        Returns:
            True if successful, False otherwise
        """
        try:
            # Get current version
            current = self.get_resource(resource_type, resource_id)
            if not current:
                logger.warning(f"Resource not found for deletion: {resource_type}/{resource_id}")
                return False

            # Create deleted version
            deleted_version = FHIRResource(
                resource_type=resource_type,
                resource_id=resource_id,
                resource_json=current.resource_json,
                is_deleted=True,
                author=author or current.author,
                source_system=current.source_system,
                hl7_message_id=current.hl7_message_id,
                order_id=current.order_id,
                patient_external_id=current.patient_external_id
            )

            self.db.add(deleted_version)
            self.db.flush()

            logger.info(f"Deleted FHIR resource: {resource_type}/{resource_id}")

            return True

        except Exception as e:
            logger.error(f"Failed to delete FHIR resource: {str(e)}")
            return False

    # ========================================================================
    # SEARCH Operations
    # ========================================================================

    def search_resources(
        self,
        resource_type: str,
        params: Dict[str, Any],
        limit: int = 20,
        offset: int = 0
    ) -> Tuple[List[FHIRResource], int]:
        """
        Search FHIR resources by parameters

        Args:
            resource_type: FHIR resource type to search
            params: Search parameters dict
            limit: Maximum results
            offset: Offset for pagination

        Returns:
            Tuple of (list of FHIRResource, total count)
        """
        try:
            # Start with base query for current (non-deleted, latest) versions
            query = self.db.query(FHIRResource).filter(
                FHIRResource.resource_type == resource_type,
                FHIRResource.is_deleted == False
            )

            # Apply search parameters
            for param_name, param_value in params.items():
                if param_name in ['_count', '_offset', '_sort']:
                    continue  # Skip pagination/sorting params

                # Join with search_params table
                query = query.join(FHIRSearchParam).filter(
                    FHIRSearchParam.param_name == param_name,
                    FHIRSearchParam.param_value.ilike(f"%{param_value}%")
                )

            # Get total count before pagination
            total = query.distinct().count()

            # Apply ordering (latest first by default)
            query = query.order_by(desc(FHIRResource.last_updated))

            # Apply pagination
            resources = query.distinct().limit(limit).offset(offset).all()

            return resources, total

        except Exception as e:
            logger.error(f"Failed to search FHIR resources: {str(e)}")
            return [], 0

    def search_by_identifier(
        self,
        resource_type: str,
        identifier_system: Optional[str],
        identifier_value: str
    ) -> Optional[FHIRResource]:
        """
        Search FHIR resource by identifier

        Args:
            resource_type: FHIR resource type
            identifier_system: Identifier system (e.g., MRN, SSN)
            identifier_value: Identifier value

        Returns:
            FHIRResource or None
        """
        try:
            # Use JSONB query for identifier
            if identifier_system:
                # Search with system and value
                query_filter = text("""
                    resource_json @> jsonb_build_object(
                        'identifier',
                        jsonb_build_array(
                            jsonb_build_object('system', :system, 'value', :value)
                        )
                    )
                """)
                resource = self.db.query(FHIRResource).filter(
                    FHIRResource.resource_type == resource_type,
                    FHIRResource.is_deleted == False,
                    query_filter
                ).params(system=identifier_system, value=identifier_value).first()
            else:
                # Search by value only
                query_filter = text("""
                    resource_json @> jsonb_build_object(
                        'identifier',
                        jsonb_build_array(
                            jsonb_build_object('value', :value)
                        )
                    )
                """)
                resource = self.db.query(FHIRResource).filter(
                    FHIRResource.resource_type == resource_type,
                    FHIRResource.is_deleted == False,
                    query_filter
                ).params(value=identifier_value).first()

            return resource

        except Exception as e:
            logger.error(f"Failed to search by identifier: {str(e)}")
            return None

    # ========================================================================
    # LINK Operations
    # ========================================================================

    def get_linked_resources(
        self,
        resource_db_id: str,
        link_type: Optional[str] = None,
        direction: str = "both"  # "source", "target", "both"
    ) -> List[FHIRResource]:
        """
        Get resources linked to a given resource

        Args:
            resource_db_id: Database UUID of the resource
            link_type: Optional filter by link type
            direction: "source" (resources this points to), "target" (resources pointing to this), "both"

        Returns:
            List of linked FHIRResource instances
        """
        try:
            linked_resources = []

            if direction in ["source", "both"]:
                # Get resources this resource points to
                query = self.db.query(FHIRResource).join(
                    FHIRResourceLink,
                    FHIRResourceLink.target_resource_id == FHIRResource.id
                ).filter(
                    FHIRResourceLink.source_resource_id == uuid.UUID(resource_db_id)
                )
                if link_type:
                    query = query.filter(FHIRResourceLink.link_type == link_type)
                linked_resources.extend(query.all())

            if direction in ["target", "both"]:
                # Get resources that point to this resource
                query = self.db.query(FHIRResource).join(
                    FHIRResourceLink,
                    FHIRResourceLink.source_resource_id == FHIRResource.id
                ).filter(
                    FHIRResourceLink.target_resource_id == uuid.UUID(resource_db_id)
                )
                if link_type:
                    query = query.filter(FHIRResourceLink.link_type == link_type)
                linked_resources.extend(query.all())

            return linked_resources

        except Exception as e:
            logger.error(f"Failed to get linked resources: {str(e)}")
            return []

    # ========================================================================
    # CONFIGURATION Operations
    # ========================================================================

    def get_config(self, config_key: str, default: Any = None) -> Any:
        """
        Get FHIR configuration value

        Args:
            config_key: Configuration key
            default: Default value if not found

        Returns:
            Configuration value with proper type
        """
        try:
            config = self.db.query(FHIRConfig).filter(
                FHIRConfig.config_key == config_key
            ).first()

            if config:
                return config.get_typed_value()
            return default

        except Exception as e:
            logger.error(f"Failed to get config: {str(e)}")
            return default

    def set_config(
        self,
        config_key: str,
        config_value: str,
        config_type: str = "string",
        description: Optional[str] = None
    ) -> bool:
        """
        Set FHIR configuration value

        Args:
            config_key: Configuration key
            config_value: Configuration value
            config_type: Value type (string, number, boolean, json)
            description: Optional description

        Returns:
            True if successful
        """
        try:
            config = self.db.query(FHIRConfig).filter(
                FHIRConfig.config_key == config_key
            ).first()

            if config:
                config.config_value = config_value
                config.config_type = config_type
                if description:
                    config.description = description
                config.updated_at = datetime.now()
            else:
                config = FHIRConfig(
                    config_key=config_key,
                    config_value=config_value,
                    config_type=config_type,
                    description=description
                )
                self.db.add(config)

            self.db.flush()
            return True

        except Exception as e:
            logger.error(f"Failed to set config: {str(e)}")
            return False

    # ========================================================================
    # UTILITY Operations
    # ========================================================================

    def get_statistics(self, resource_type: Optional[str] = None) -> Dict[str, Any]:
        """
        Get statistics about FHIR resources

        Args:
            resource_type: Optional filter by resource type

        Returns:
            Statistics dict
        """
        try:
            query = self.db.query(FHIRResource)

            if resource_type:
                query = query.filter(FHIRResource.resource_type == resource_type)

            total = query.count()
            current = query.filter(FHIRResource.is_deleted == False).count()
            deleted = query.filter(FHIRResource.is_deleted == True).count()

            # Get counts by resource type
            type_counts = {}
            if not resource_type:
                type_query = self.db.query(
                    FHIRResource.resource_type,
                    text('COUNT(DISTINCT resource_id) as count')
                ).filter(
                    FHIRResource.is_deleted == False
                ).group_by(FHIRResource.resource_type).all()

                type_counts = {row[0]: row[1] for row in type_query}

            return {
                'total_versions': total,
                'current_resources': current,
                'deleted_resources': deleted,
                'resource_type_counts': type_counts
            }

        except Exception as e:
            logger.error(f"Failed to get statistics: {str(e)}")
            return {}
