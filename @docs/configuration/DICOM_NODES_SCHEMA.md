# DICOM Nodes Database Schema

## Overview

Database schema untuk DICOM Node Management terdiri dari 3 tabel utama dan beberapa views untuk reporting.

## Tables

### 1. `pacs_dicom_nodes` - Main Nodes Table

Tabel utama untuk menyimpan konfigurasi DICOM nodes (modalities, PACS, workstations).

```sql
CREATE TABLE pacs_dicom_nodes (
    -- Primary Key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Node Information
    ae_title VARCHAR(16) NOT NULL UNIQUE,  -- DICOM AE Title
    name VARCHAR(100) NOT NULL,            -- Display name
    description TEXT,                       -- Optional description
    
    -- Network Configuration
    host VARCHAR(255) NOT NULL,            -- IP address or hostname
    port INTEGER NOT NULL,                 -- Port number (1-65535)
    
    -- Node Type
    node_type VARCHAR(20) NOT NULL,        -- 'modality', 'pacs', 'workstation'
    modality VARCHAR(16),                  -- CT, MR, CR, etc. (for modality type)
    
    -- Capabilities (DICOM Services)
    supports_c_store BOOLEAN DEFAULT TRUE, -- Can receive/send images
    supports_c_find BOOLEAN DEFAULT TRUE,  -- Can query
    supports_c_move BOOLEAN DEFAULT TRUE,  -- Can retrieve
    supports_c_echo BOOLEAN DEFAULT TRUE,  -- Can verify connection
    
    -- Security (Optional)
    require_authentication BOOLEAN DEFAULT FALSE,
    username VARCHAR(100),
    password_hash VARCHAR(255),
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,        -- Enabled/disabled
    is_online BOOLEAN DEFAULT FALSE,       -- Current online status
    last_seen TIMESTAMP,                   -- Last successful connection
    last_echo TIMESTAMP,                   -- Last C-ECHO test
    
    -- Statistics
    total_studies_received INTEGER DEFAULT 0,
    total_studies_sent INTEGER DEFAULT 0,
    total_bytes_received BIGINT DEFAULT 0,
    total_bytes_sent BIGINT DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Configuration (JSON)
    config JSONB,  -- Additional settings (max_pdu_length, timeout, etc.)
    
    -- Constraints
    CHECK (port > 0 AND port < 65536),
    CHECK (node_type IN ('modality', 'pacs', 'workstation'))
);
```

**Indexes:**
```sql
CREATE INDEX idx_pacs_dicom_nodes_ae_title ON pacs_dicom_nodes(ae_title);
CREATE INDEX idx_pacs_dicom_nodes_node_type ON pacs_dicom_nodes(node_type);
CREATE INDEX idx_pacs_dicom_nodes_is_active ON pacs_dicom_nodes(is_active);
CREATE INDEX idx_pacs_dicom_nodes_is_online ON pacs_dicom_nodes(is_online);
CREATE INDEX idx_pacs_dicom_nodes_last_seen ON pacs_dicom_nodes(last_seen);
```

### 2. `pacs_dicom_associations` - Connection Log

Tabel untuk logging setiap DICOM association (connection).

```sql
CREATE TABLE pacs_dicom_associations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Association Information
    node_id UUID REFERENCES pacs_dicom_nodes(id) ON DELETE CASCADE,
    ae_title VARCHAR(16) NOT NULL,
    
    -- Connection Details
    remote_host VARCHAR(255) NOT NULL,
    remote_port INTEGER NOT NULL,
    remote_ae_title VARCHAR(16),
    
    -- Association Type
    association_type VARCHAR(20) NOT NULL,  -- 'incoming', 'outgoing'
    
    -- Status
    status VARCHAR(20) NOT NULL,  -- 'accepted', 'rejected', 'aborted', 'completed'
    
    -- Operations
    operations_performed JSONB,  -- List of operations performed
    
    -- Statistics
    studies_transferred INTEGER DEFAULT 0,
    bytes_transferred BIGINT DEFAULT 0,
    duration_seconds INTEGER,
    
    -- Error Information
    error_message TEXT,
    
    -- Timestamps
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP,
    
    -- Metadata
    metadata JSONB
);
```

**Indexes:**
```sql
CREATE INDEX idx_pacs_dicom_associations_node_id ON pacs_dicom_associations(node_id);
CREATE INDEX idx_pacs_dicom_associations_ae_title ON pacs_dicom_associations(ae_title);
CREATE INDEX idx_pacs_dicom_associations_status ON pacs_dicom_associations(status);
CREATE INDEX idx_pacs_dicom_associations_started_at ON pacs_dicom_associations(started_at);
```

### 3. `pacs_dicom_operations` - Operations Log

Tabel untuk logging setiap DICOM operation (C-STORE, C-FIND, C-MOVE, C-ECHO).

```sql
CREATE TABLE pacs_dicom_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- References
    association_id UUID REFERENCES pacs_dicom_associations(id) ON DELETE CASCADE,
    node_id UUID REFERENCES pacs_dicom_nodes(id) ON DELETE CASCADE,
    
    -- Operation Details
    operation_type VARCHAR(20) NOT NULL,  -- 'C-STORE', 'C-FIND', 'C-MOVE', 'C-ECHO'
    direction VARCHAR(10) NOT NULL,       -- 'incoming', 'outgoing'
    
    -- DICOM Information
    study_id VARCHAR(64),
    series_id VARCHAR(64),
    instance_id VARCHAR(64),
    sop_class_uid VARCHAR(64),
    
    -- Status
    status VARCHAR(20) NOT NULL,  -- 'success', 'failure', 'pending'
    status_code INTEGER,
    status_message TEXT,
    
    -- Performance
    duration_ms INTEGER,
    bytes_transferred BIGINT,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    
    -- Metadata
    metadata JSONB
);
```

**Indexes:**
```sql
CREATE INDEX idx_pacs_dicom_operations_association_id ON pacs_dicom_operations(association_id);
CREATE INDEX idx_pacs_dicom_operations_node_id ON pacs_dicom_operations(node_id);
CREATE INDEX idx_pacs_dicom_operations_operation_type ON pacs_dicom_operations(operation_type);
CREATE INDEX idx_pacs_dicom_operations_status ON pacs_dicom_operations(status);
CREATE INDEX idx_pacs_dicom_operations_created_at ON pacs_dicom_operations(created_at);
```

## Views

### 1. `v_active_dicom_nodes` - Active Nodes View

```sql
CREATE VIEW v_active_dicom_nodes AS
SELECT 
    id, ae_title, name, node_type, host, port,
    is_online, last_seen,
    total_studies_received, total_studies_sent
FROM pacs_dicom_nodes
WHERE is_active = TRUE
ORDER BY name;
```

### 2. `v_recent_dicom_operations` - Recent Operations View

```sql
CREATE VIEW v_recent_dicom_operations AS
SELECT 
    o.id, o.operation_type, o.direction, o.status,
    n.ae_title, n.name AS node_name,
    o.study_id, o.duration_ms, o.created_at
FROM pacs_dicom_operations o
LEFT JOIN pacs_dicom_nodes n ON o.node_id = n.id
ORDER BY o.created_at DESC
LIMIT 100;
```

### 3. `v_dicom_node_stats` - Node Statistics View

```sql
CREATE VIEW v_dicom_node_stats AS
SELECT 
    n.id, n.ae_title, n.name, n.node_type, n.is_online,
    n.total_studies_received, n.total_studies_sent,
    COUNT(DISTINCT a.id) AS total_associations,
    COUNT(DISTINCT o.id) AS total_operations,
    SUM(CASE WHEN o.status = 'success' THEN 1 ELSE 0 END) AS successful_operations,
    SUM(CASE WHEN o.status = 'failure' THEN 1 ELSE 0 END) AS failed_operations
FROM pacs_dicom_nodes n
LEFT JOIN pacs_dicom_associations a ON n.id = a.node_id
LEFT JOIN pacs_dicom_operations o ON n.id = o.node_id
GROUP BY n.id, n.ae_title, n.name, n.node_type, n.is_online, 
         n.total_studies_received, n.total_studies_sent;
```

## Functions

### `update_dicom_node_stats(p_node_id UUID)`

Function untuk update statistik node berdasarkan operations log.

```sql
CREATE FUNCTION update_dicom_node_stats(p_node_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE pacs_dicom_nodes
    SET 
        total_studies_received = (
            SELECT COUNT(DISTINCT study_id)
            FROM pacs_dicom_operations
            WHERE node_id = p_node_id 
            AND operation_type = 'C-STORE'
            AND direction = 'incoming'
            AND status = 'success'
        ),
        total_studies_sent = (
            SELECT COUNT(DISTINCT study_id)
            FROM pacs_dicom_operations
            WHERE node_id = p_node_id 
            AND operation_type = 'C-STORE'
            AND direction = 'outgoing'
            AND status = 'success'
        )
    WHERE id = p_node_id;
END;
$$ LANGUAGE plpgsql;
```

## Initial Data

Migration akan membuat 2 default nodes:

### 1. Local PACS SCP
```sql
INSERT INTO pacs_dicom_nodes (
    ae_title, name, description, host, port, node_type,
    supports_c_store, supports_c_find, supports_c_move, supports_c_echo,
    is_active, is_online, config
) VALUES (
    'PACS_SCP',
    'Local PACS SCP',
    'Local PACS Storage SCP Service - receives images from modalities',
    '0.0.0.0', 11112, 'pacs',
    TRUE, TRUE, TRUE, TRUE,
    TRUE, TRUE,
    '{"max_pdu_length": 16384, "timeout": 30}'::jsonb
);
```

### 2. Example CT Modality
```sql
INSERT INTO pacs_dicom_nodes (
    ae_title, name, description, host, port, node_type, modality,
    supports_c_store, supports_c_find, supports_c_move, supports_c_echo,
    is_active, is_online, config
) VALUES (
    'CT_MODALITY',
    'CT Scanner',
    'Example CT Modality for testing',
    'localhost', 11113, 'modality', 'CT',
    TRUE, FALSE, FALSE, TRUE,
    FALSE, FALSE,
    '{"max_pdu_length": 16384, "timeout": 30}'::jsonb
);
```

## Running the Migration

```bash
# From pacs-service directory
python migrations/run_migration.py 005
```

## Verification Queries

### Check Active Nodes
```sql
SELECT * FROM v_active_dicom_nodes;
```

### Check Node Statistics
```sql
SELECT * FROM v_dicom_node_stats;
```

### Check Recent Operations
```sql
SELECT * FROM v_recent_dicom_operations;
```

### Get Node by AE Title
```sql
SELECT * FROM pacs_dicom_nodes WHERE ae_title = 'PACS_SCP';
```

### Get Online Nodes
```sql
SELECT ae_title, name, host, port, last_seen 
FROM pacs_dicom_nodes 
WHERE is_online = TRUE 
AND is_active = TRUE;
```

## SQLAlchemy Model

File: `pacs-service/app/models/dicom_node.py`

```python
from sqlalchemy import Column, String, Integer, Boolean, DateTime, Text, BigInteger
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
import uuid
from app.database import Base

class DicomNode(Base):
    __tablename__ = "pacs_dicom_nodes"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ae_title = Column(String(16), unique=True, nullable=False, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    host = Column(String(255), nullable=False)
    port = Column(Integer, nullable=False)
    node_type = Column(String(20), nullable=False)
    modality = Column(String(16), nullable=True)
    supports_c_store = Column(Boolean, default=True)
    supports_c_find = Column(Boolean, default=True)
    supports_c_move = Column(Boolean, default=True)
    supports_c_echo = Column(Boolean, default=True)
    require_authentication = Column(Boolean, default=False)
    username = Column(String(100), nullable=True)
    password_hash = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True)
    is_online = Column(Boolean, default=False)
    last_seen = Column(DateTime(timezone=True), nullable=True)
    last_echo = Column(DateTime(timezone=True), nullable=True)
    total_studies_received = Column(Integer, default=0)
    total_studies_sent = Column(Integer, default=0)
    total_bytes_received = Column(BigInteger, default=0)
    total_bytes_sent = Column(BigInteger, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    config = Column(JSONB, nullable=True)
```

## Notes

1. **Table Naming:** Menggunakan prefix `pacs_` untuk menghindari konflik dengan tabel lain
2. **UUID Primary Keys:** Untuk better scalability dan security
3. **JSONB Config:** Flexible configuration storage untuk settings tambahan
4. **Cascade Delete:** Operations dan associations akan terhapus otomatis saat node dihapus
5. **Indexes:** Optimized untuk query yang sering digunakan (ae_title, node_type, status, timestamps)
