"""
DICOM Node Management API
Manage DICOM network nodes (modalities, PACS)
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, Field, field_serializer
from uuid import UUID

from app.database import get_db
from app.models.dicom_node import DicomNode
from app.services.dicom_echo import test_dicom_connection

router = APIRouter(prefix="/api/dicom/nodes", tags=["DICOM Nodes"])


# Pydantic Schemas
class DicomNodeBase(BaseModel):
    ae_title: str = Field(..., max_length=16, description="DICOM AE Title")
    host: str = Field(..., description="Hostname or IP address")
    port: int = Field(..., ge=1, le=65535, description="Port number")
    name: str = Field(..., description="Node name")
    description: Optional[str] = None
    node_type: str = Field(..., description="MODALITY, PACS, or WORKSTATION")
    modality: Optional[str] = Field(None, max_length=10, description="CT, MR, CR, etc.")
    max_pdu_length: int = Field(16384, description="Maximum PDU length")
    timeout: int = Field(30, description="Connection timeout in seconds")
    supports_c_store: bool = True
    supports_c_find: bool = True
    supports_c_move: bool = True
    supports_c_echo: bool = True
    is_active: bool = True


class DicomNodeCreate(DicomNodeBase):
    pass


class DicomNodeUpdate(BaseModel):
    host: Optional[str] = None
    port: Optional[int] = Field(None, ge=1, le=65535)
    name: Optional[str] = None
    description: Optional[str] = None
    node_type: Optional[str] = None
    modality: Optional[str] = None
    max_pdu_length: Optional[int] = None
    timeout: Optional[int] = None
    supports_c_store: Optional[bool] = None
    supports_c_find: Optional[bool] = None
    supports_c_move: Optional[bool] = None
    supports_c_echo: Optional[bool] = None
    is_active: Optional[bool] = None


class DicomNodeResponse(DicomNodeBase):
    id: UUID
    is_online: bool = False
    last_seen: Optional[datetime] = None
    last_echo: Optional[datetime] = None
    total_studies_received: int = 0
    total_studies_sent: int = 0
    created_at: datetime
    updated_at: Optional[datetime] = None

    @field_serializer('id')
    def serialize_id(self, value: UUID) -> str:
        return str(value)

    class Config:
        from_attributes = True


class ConnectionTestResponse(BaseModel):
    success: bool
    status: str
    message: str
    response_time_ms: Optional[float] = None


# API Endpoints
@router.get("", response_model=List[DicomNodeResponse])
def list_nodes(
    node_type: Optional[str] = None,
    is_active: Optional[bool] = None,
    db: Session = Depends(get_db)
):
    """List all DICOM nodes"""
    query = db.query(DicomNode)
    
    if node_type:
        query = query.filter(DicomNode.node_type == node_type)
    if is_active is not None:
        query = query.filter(DicomNode.is_active == is_active)
    
    nodes = query.order_by(DicomNode.name).all()
    return nodes


@router.get("/{node_id}", response_model=DicomNodeResponse)
def get_node(node_id: str, db: Session = Depends(get_db)):
    """Get DICOM node by ID"""
    node = db.query(DicomNode).filter(DicomNode.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    return node


@router.post("", response_model=DicomNodeResponse, status_code=status.HTTP_201_CREATED)
def create_node(node_data: DicomNodeCreate, db: Session = Depends(get_db)):
    """Create new DICOM node"""
    
    # Check if AE title already exists
    existing = db.query(DicomNode).filter(DicomNode.ae_title == node_data.ae_title).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Node with AE title '{node_data.ae_title}' already exists"
        )
    
    # Create node
    node = DicomNode(**node_data.model_dump())
    db.add(node)
    db.commit()
    db.refresh(node)
    
    return node


@router.put("/{node_id}", response_model=DicomNodeResponse)
def update_node(
    node_id: str,
    node_data: DicomNodeUpdate,
    db: Session = Depends(get_db)
):
    """Update DICOM node"""
    node = db.query(DicomNode).filter(DicomNode.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    
    # Update fields
    update_data = node_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(node, field, value)
    
    db.commit()
    db.refresh(node)
    
    return node


@router.delete("/{node_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_node(node_id: str, db: Session = Depends(get_db)):
    """Delete DICOM node"""
    node = db.query(DicomNode).filter(DicomNode.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    
    db.delete(node)
    db.commit()
    
    return None


@router.post("/{node_id}/test", response_model=ConnectionTestResponse)
def test_node_connection(node_id: str, db: Session = Depends(get_db)):
    """Test connection to DICOM node using C-ECHO"""
    node = db.query(DicomNode).filter(DicomNode.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    
    # Get timeout from config or use default
    timeout = 30
    if node.config and isinstance(node.config, dict):
        timeout = node.config.get('timeout', 30)
    
    # Test connection
    result = test_dicom_connection(
        ae_title=node.ae_title,
        host=node.host,
        port=node.port,
        timeout=timeout
    )
    
    # Update node status
    node.last_seen = datetime.now()
    node.last_echo = datetime.now()
    node.is_online = result["success"]
    db.commit()
    
    return result


@router.post("/test-connection", response_model=ConnectionTestResponse)
def test_connection(
    ae_title: str,
    host: str,
    port: int,
    timeout: int = 30
):
    """Test DICOM connection without saving (for validation)"""
    result = test_dicom_connection(
        ae_title=ae_title,
        host=host,
        port=port,
        timeout=timeout
    )
    return result
