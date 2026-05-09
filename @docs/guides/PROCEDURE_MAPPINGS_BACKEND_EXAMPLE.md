# Procedure Mappings - Backend API Implementation Example

## Overview
Contoh implementasi backend API endpoints untuk procedure mappings di external systems.

## Database Schema

### Procedure Mappings Table
```sql
CREATE TABLE procedure_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_system_id UUID NOT NULL REFERENCES external_systems(id) ON DELETE CASCADE,
  external_code VARCHAR(100) NOT NULL,
  external_name VARCHAR(255) NOT NULL,
  pacs_code VARCHAR(100) NOT NULL,
  pacs_name VARCHAR(255) NOT NULL,
  modality VARCHAR(10),
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by UUID,
  updated_by UUID,
  UNIQUE(external_system_id, external_code)
);

CREATE INDEX idx_procedure_mappings_system_id ON procedure_mappings(external_system_id);
CREATE INDEX idx_procedure_mappings_external_code ON procedure_mappings(external_code);
CREATE INDEX idx_procedure_mappings_pacs_code ON procedure_mappings(pacs_code);
CREATE INDEX idx_procedure_mappings_modality ON procedure_mappings(modality);
```

### PACS Procedures Table
```sql
CREATE TABLE pacs_procedures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  modality VARCHAR(10),
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pacs_procedures_code ON pacs_procedures(code);
CREATE INDEX idx_pacs_procedures_modality ON pacs_procedures(modality);
```

## API Endpoints

### 1. List Procedure Mappings

**Endpoint:**
```
GET /api/external-systems/{systemId}/mappings/procedures
```

**Query Parameters:**
```
page: number (default: 1)
page_size: number (default: 20)
search: string (optional)
modality: string (optional)
is_active: boolean (optional)
```

**Response:**
```json
{
  "items": [
    {
      "id": "uuid",
      "external_system_id": "uuid",
      "external_code": "XR001",
      "external_name": "Thorax AP/PA",
      "pacs_code": "CR-CHEST-PA",
      "pacs_name": "Chest X-ray PA View",
      "modality": "CR",
      "description": "Standard chest X-ray",
      "is_active": true,
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z"
    }
  ],
  "total": 100,
  "page": 1,
  "page_size": 20,
  "total_pages": 5
}
```

**Implementation (Python/Flask):**
```python
@app.route('/api/external-systems/<system_id>/mappings/procedures', methods=['GET'])
def list_procedure_mappings(system_id):
    page = request.args.get('page', 1, type=int)
    page_size = request.args.get('page_size', 20, type=int)
    search = request.args.get('search', '')
    modality = request.args.get('modality', '')
    is_active = request.args.get('is_active', None)
    
    query = ProcedureMapping.query.filter_by(external_system_id=system_id)
    
    if search:
        query = query.filter(
            or_(
                ProcedureMapping.external_code.ilike(f'%{search}%'),
                ProcedureMapping.external_name.ilike(f'%{search}%')
            )
        )
    
    if modality:
        query = query.filter_by(modality=modality)
    
    if is_active is not None:
        query = query.filter_by(is_active=is_active == 'true')
    
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    
    return jsonify({
        'items': [item.to_dict() for item in items],
        'total': total,
        'page': page,
        'page_size': page_size,
        'total_pages': (total + page_size - 1) // page_size
    })
```

### 2. Get Single Procedure Mapping

**Endpoint:**
```
GET /api/external-systems/{systemId}/mappings/procedures/{id}
```

**Response:**
```json
{
  "id": "uuid",
  "external_system_id": "uuid",
  "external_code": "XR001",
  "external_name": "Thorax AP/PA",
  "pacs_code": "CR-CHEST-PA",
  "pacs_name": "Chest X-ray PA View",
  "modality": "CR",
  "description": "Standard chest X-ray",
  "is_active": true,
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z"
}
```

**Implementation:**
```python
@app.route('/api/external-systems/<system_id>/mappings/procedures/<mapping_id>', methods=['GET'])
def get_procedure_mapping(system_id, mapping_id):
    mapping = ProcedureMapping.query.filter_by(
        id=mapping_id,
        external_system_id=system_id
    ).first_or_404()
    
    return jsonify(mapping.to_dict())
```

### 3. Create Procedure Mapping

**Endpoint:**
```
POST /api/external-systems/{systemId}/mappings/procedures
```

**Request Body:**
```json
{
  "external_code": "XR001",
  "external_name": "Thorax AP/PA",
  "pacs_code": "CR-CHEST-PA",
  "pacs_name": "Chest X-ray PA View",
  "modality": "CR",
  "description": "Standard chest X-ray"
}
```

**Response:**
```json
{
  "id": "uuid",
  "external_system_id": "uuid",
  "external_code": "XR001",
  "external_name": "Thorax AP/PA",
  "pacs_code": "CR-CHEST-PA",
  "pacs_name": "Chest X-ray PA View",
  "modality": "CR",
  "description": "Standard chest X-ray",
  "is_active": true,
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z"
}
```

**Implementation:**
```python
@app.route('/api/external-systems/<system_id>/mappings/procedures', methods=['POST'])
def create_procedure_mapping(system_id):
    data = request.get_json()
    
    # Validate required fields
    required_fields = ['external_code', 'external_name', 'pacs_code', 'pacs_name']
    for field in required_fields:
        if not data.get(field):
            return jsonify({'error': f'{field} is required'}), 400
    
    # Check for duplicate
    existing = ProcedureMapping.query.filter_by(
        external_system_id=system_id,
        external_code=data['external_code']
    ).first()
    
    if existing:
        return jsonify({'error': 'Mapping with this code already exists'}), 409
    
    # Validate PACS code exists
    pacs_proc = PacsProcedure.query.filter_by(code=data['pacs_code']).first()
    if not pacs_proc:
        return jsonify({'error': 'PACS procedure not found'}), 404
    
    # Create mapping
    mapping = ProcedureMapping(
        external_system_id=system_id,
        external_code=data['external_code'],
        external_name=data['external_name'],
        pacs_code=data['pacs_code'],
        pacs_name=data['pacs_name'],
        modality=data.get('modality'),
        description=data.get('description'),
        created_by=current_user.id
    )
    
    db.session.add(mapping)
    db.session.commit()
    
    return jsonify(mapping.to_dict()), 201
```

### 4. Update Procedure Mapping

**Endpoint:**
```
PUT /api/external-systems/{systemId}/mappings/procedures/{id}
```

**Request Body:**
```json
{
  "external_name": "Thorax AP/PA (Updated)",
  "pacs_name": "Chest X-ray PA View (Updated)",
  "modality": "CR",
  "description": "Updated description"
}
```

**Response:**
```json
{
  "id": "uuid",
  "external_system_id": "uuid",
  "external_code": "XR001",
  "external_name": "Thorax AP/PA (Updated)",
  "pacs_code": "CR-CHEST-PA",
  "pacs_name": "Chest X-ray PA View (Updated)",
  "modality": "CR",
  "description": "Updated description",
  "is_active": true,
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z"
}
```

**Implementation:**
```python
@app.route('/api/external-systems/<system_id>/mappings/procedures/<mapping_id>', methods=['PUT'])
def update_procedure_mapping(system_id, mapping_id):
    mapping = ProcedureMapping.query.filter_by(
        id=mapping_id,
        external_system_id=system_id
    ).first_or_404()
    
    data = request.get_json()
    
    # Update fields
    if 'external_name' in data:
        mapping.external_name = data['external_name']
    if 'pacs_code' in data:
        # Validate PACS code exists
        pacs_proc = PacsProcedure.query.filter_by(code=data['pacs_code']).first()
        if not pacs_proc:
            return jsonify({'error': 'PACS procedure not found'}), 404
        mapping.pacs_code = data['pacs_code']
    if 'pacs_name' in data:
        mapping.pacs_name = data['pacs_name']
    if 'modality' in data:
        mapping.modality = data['modality']
    if 'description' in data:
        mapping.description = data['description']
    
    mapping.updated_by = current_user.id
    mapping.updated_at = datetime.utcnow()
    
    db.session.commit()
    
    return jsonify(mapping.to_dict())
```

### 5. Delete Procedure Mapping

**Endpoint:**
```
DELETE /api/external-systems/{systemId}/mappings/procedures/{id}
```

**Response:**
```json
{
  "success": true,
  "message": "Mapping deleted successfully"
}
```

**Implementation:**
```python
@app.route('/api/external-systems/<system_id>/mappings/procedures/<mapping_id>', methods=['DELETE'])
def delete_procedure_mapping(system_id, mapping_id):
    mapping = ProcedureMapping.query.filter_by(
        id=mapping_id,
        external_system_id=system_id
    ).first_or_404()
    
    db.session.delete(mapping)
    db.session.commit()
    
    return jsonify({'success': True, 'message': 'Mapping deleted successfully'})
```

### 6. Bulk Import Procedure Mappings

**Endpoint:**
```
POST /api/external-systems/{systemId}/mappings/procedures/bulk
```

**Request Body:**
```json
{
  "mappings": [
    {
      "external_code": "XR001",
      "external_name": "Thorax AP/PA",
      "pacs_code": "CR-CHEST-PA",
      "pacs_name": "Chest X-ray PA View",
      "modality": "CR"
    },
    {
      "external_code": "XR002",
      "external_name": "Thorax Lateral",
      "pacs_code": "CR-CHEST-LAT",
      "pacs_name": "Chest X-ray Lateral View",
      "modality": "CR"
    }
  ]
}
```

**Response:**
```json
{
  "total": 2,
  "successful": 2,
  "failed": 0,
  "errors": []
}
```

**Implementation:**
```python
@app.route('/api/external-systems/<system_id>/mappings/procedures/bulk', methods=['POST'])
def bulk_import_procedure_mappings(system_id):
    data = request.get_json()
    mappings = data.get('mappings', [])
    
    result = {
        'total': len(mappings),
        'successful': 0,
        'failed': 0,
        'errors': []
    }
    
    for mapping_data in mappings:
        try:
            # Validate required fields
            required_fields = ['external_code', 'external_name', 'pacs_code', 'pacs_name']
            for field in required_fields:
                if not mapping_data.get(field):
                    raise ValueError(f'{field} is required')
            
            # Check for duplicate
            existing = ProcedureMapping.query.filter_by(
                external_system_id=system_id,
                external_code=mapping_data['external_code']
            ).first()
            
            if existing:
                # Update existing
                existing.external_name = mapping_data['external_name']
                existing.pacs_code = mapping_data['pacs_code']
                existing.pacs_name = mapping_data['pacs_name']
                existing.modality = mapping_data.get('modality')
                existing.updated_by = current_user.id
                existing.updated_at = datetime.utcnow()
            else:
                # Create new
                mapping = ProcedureMapping(
                    external_system_id=system_id,
                    external_code=mapping_data['external_code'],
                    external_name=mapping_data['external_name'],
                    pacs_code=mapping_data['pacs_code'],
                    pacs_name=mapping_data['pacs_name'],
                    modality=mapping_data.get('modality'),
                    created_by=current_user.id
                )
                db.session.add(mapping)
            
            result['successful'] += 1
        except Exception as e:
            result['failed'] += 1
            result['errors'].append({
                'code': mapping_data.get('external_code'),
                'error': str(e)
            })
    
    db.session.commit()
    return jsonify(result)
```

### 7. List PACS Procedures

**Endpoint:**
```
GET /api/pacs/procedures
```

**Query Parameters:**
```
page: number (default: 1)
page_size: number (default: 100)
modality: string (optional)
```

**Response:**
```json
{
  "items": [
    {
      "id": "uuid",
      "code": "CR-CHEST-PA",
      "name": "Chest X-ray PA View",
      "modality": "CR",
      "description": "Standard chest X-ray PA view"
    }
  ],
  "total": 50,
  "page": 1,
  "page_size": 100,
  "total_pages": 1
}
```

**Implementation:**
```python
@app.route('/api/pacs/procedures', methods=['GET'])
def list_pacs_procedures():
    page = request.args.get('page', 1, type=int)
    page_size = request.args.get('page_size', 100, type=int)
    modality = request.args.get('modality', '')
    
    query = PacsProcedure.query.filter_by(is_active=True)
    
    if modality:
        query = query.filter_by(modality=modality)
    
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    
    return jsonify({
        'items': [item.to_dict() for item in items],
        'total': total,
        'page': page,
        'page_size': page_size,
        'total_pages': (total + page_size - 1) // page_size
    })
```

## Model Classes

### ProcedureMapping Model
```python
class ProcedureMapping(db.Model):
    __tablename__ = 'procedure_mappings'
    
    id = db.Column(UUID, primary_key=True, default=uuid4)
    external_system_id = db.Column(UUID, db.ForeignKey('external_systems.id'), nullable=False)
    external_code = db.Column(String(100), nullable=False)
    external_name = db.Column(String(255), nullable=False)
    pacs_code = db.Column(String(100), nullable=False)
    pacs_name = db.Column(String(255), nullable=False)
    modality = db.Column(String(10))
    description = db.Column(Text)
    is_active = db.Column(Boolean, default=True)
    created_at = db.Column(DateTime, default=datetime.utcnow)
    updated_at = db.Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = db.Column(UUID, db.ForeignKey('users.id'))
    updated_by = db.Column(UUID, db.ForeignKey('users.id'))
    
    __table_args__ = (
        db.UniqueConstraint('external_system_id', 'external_code', name='uq_system_code'),
    )
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'external_system_id': str(self.external_system_id),
            'external_code': self.external_code,
            'external_name': self.external_name,
            'pacs_code': self.pacs_code,
            'pacs_name': self.pacs_name,
            'modality': self.modality,
            'description': self.description,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }
```

### PacsProcedure Model
```python
class PacsProcedure(db.Model):
    __tablename__ = 'pacs_procedures'
    
    id = db.Column(UUID, primary_key=True, default=uuid4)
    code = db.Column(String(100), unique=True, nullable=False)
    name = db.Column(String(255), nullable=False)
    modality = db.Column(String(10))
    description = db.Column(Text)
    is_active = db.Column(Boolean, default=True)
    created_at = db.Column(DateTime, default=datetime.utcnow)
    updated_at = db.Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'code': self.code,
            'name': self.name,
            'modality': self.modality,
            'description': self.description
        }
```

## Error Handling

### Common Errors

**400 Bad Request**
```json
{
  "error": "external_code is required"
}
```

**404 Not Found**
```json
{
  "error": "Mapping not found"
}
```

**409 Conflict**
```json
{
  "error": "Mapping with this code already exists"
}
```

**500 Internal Server Error**
```json
{
  "error": "Internal server error"
}
```

## Testing

### Unit Tests
```python
def test_create_procedure_mapping():
    response = client.post(
        f'/api/external-systems/{system_id}/mappings/procedures',
        json={
            'external_code': 'XR001',
            'external_name': 'Thorax AP/PA',
            'pacs_code': 'CR-CHEST-PA',
            'pacs_name': 'Chest X-ray PA View',
            'modality': 'CR'
        }
    )
    assert response.status_code == 201
    assert response.json['external_code'] == 'XR001'

def test_list_procedure_mappings():
    response = client.get(f'/api/external-systems/{system_id}/mappings/procedures')
    assert response.status_code == 200
    assert 'items' in response.json
    assert 'total' in response.json

def test_update_procedure_mapping():
    response = client.put(
        f'/api/external-systems/{system_id}/mappings/procedures/{mapping_id}',
        json={'external_name': 'Updated Name'}
    )
    assert response.status_code == 200
    assert response.json['external_name'] == 'Updated Name'

def test_delete_procedure_mapping():
    response = client.delete(
        f'/api/external-systems/{system_id}/mappings/procedures/{mapping_id}'
    )
    assert response.status_code == 200
    assert response.json['success'] == True
```

## Conclusion

Backend API implementation untuk procedure mappings sudah lengkap dengan:
- ✅ CRUD operations
- ✅ Search dan filter
- ✅ Pagination
- ✅ Bulk import
- ✅ Error handling
- ✅ Validation
- ✅ Database schema

Siap untuk production deployment!
