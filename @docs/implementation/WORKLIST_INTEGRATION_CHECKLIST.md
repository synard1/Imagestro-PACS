# Worklist Integration Checklist

**Date**: November 18, 2025  
**Status**: Ready for Integration

---

## ✅ Frontend Implementation Complete

### Files Created
- [x] `src/services/worklistService.js` - Worklist API service
- [x] `src/components/worklist/WorklistStatusBadge.jsx` - Status badge component
- [x] `src/components/worklist/WorklistPriorityBadge.jsx` - Priority badge component
- [x] `src/components/worklist/WorklistActions.jsx` - Action buttons component
- [x] `src/components/worklist/RescheduleModal.jsx` - Reschedule modal
- [x] `src/components/worklist/CancelOrderModal.jsx` - Cancel modal

### Files Updated
- [x] `src/pages/Worklist.jsx` - Enhanced worklist page
- [x] `src/services/api-registry.js` - Added worklist configuration

### Documentation Created
- [x] `docs/WORKLIST_SYSTEM_DOCUMENTATION.md` - Complete system documentation
- [x] `docs/WORKLIST_UI_IMPLEMENTATION.md` - UI implementation guide
- [x] `docs/WORKLIST_COMPONENT_DIAGRAM.md` - Component architecture
- [x] `docs/WORKLIST_QUICK_START.md` - Quick start guide
- [x] `WORKLIST_UI_UPDATE_SUMMARY.md` - Implementation summary

---

## 🔧 Backend Integration Tasks

### 1. Database Setup

#### Run Migration
```bash
# Connect to database
psql -U postgres -d pacs_db

# Run migration
\i pacs-service/migrations/006_create_worklist_tables.sql

# Verify tables created
\dt worklist*
\dt schedule*
```

**Expected Tables**:
- [ ] `worklist_items` - DICOM MWL items
- [ ] `worklist_history` - Audit trail
- [ ] `schedule_slots` - Time slot management

**Expected Views**:
- [ ] `v_worklist_today` - Today's worklist
- [ ] `v_worklist_summary` - Summary statistics
- [ ] `v_worklist_active` - Active items with details
- [ ] `v_schedule_availability` - Available slots

**Expected Functions**:
- [ ] `get_worklist_for_modality()` - DICOM MWL query
- [ ] `get_available_slots()` - Get available slots
- [ ] `book_schedule_slot()` - Book a slot
- [ ] `release_schedule_slot()` - Release a slot
- [ ] `generate_daily_schedule_slots()` - Generate slots

**Expected Triggers**:
- [ ] `trg_worklist_items_updated_at` - Update timestamp
- [ ] `trg_schedule_slots_updated_at` - Update timestamp
- [ ] `trg_create_worklist_item` - Auto-create from order
- [ ] `trg_sync_worklist_status` - Sync with order status
- [ ] `trg_log_worklist_changes` - Log changes
- [ ] `trg_update_slot_capacity` - Update slot capacity

#### Verify Migration
```sql
-- Check table structure
\d worklist_items
\d worklist_history
\d schedule_slots

-- Check indexes
\di worklist*
\di schedule*

-- Check triggers
SELECT tgname, tgrelid::regclass, tgtype 
FROM pg_trigger 
WHERE tgname LIKE '%worklist%' OR tgname LIKE '%schedule%';

-- Check functions
\df get_worklist*
\df *schedule*
```

### 2. API Endpoints Implementation

#### Worklist Endpoints

**GET /api/worklist**
```python
# Get worklist items with filters
@router.get("/api/worklist")
async def get_worklist(
    date: Optional[str] = None,
    modality: Optional[str] = None,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    search: Optional[str] = None
):
    # Query worklist_items table
    # Apply filters
    # Return list of worklist items
    pass
```
- [ ] Implemented
- [ ] Tested
- [ ] Documented

**GET /api/worklist/:id**
```python
# Get specific worklist item
@router.get("/api/worklist/{id}")
async def get_worklist_item(id: str):
    # Query worklist_items by id
    # Return worklist item
    pass
```
- [ ] Implemented
- [ ] Tested
- [ ] Documented

**GET /api/worklist/summary**
```python
# Get worklist summary statistics
@router.get("/api/worklist/summary")
async def get_worklist_summary(date: Optional[str] = None):
    # Query v_worklist_summary view
    # Return statistics
    pass
```
- [ ] Implemented
- [ ] Tested
- [ ] Documented

#### Order Status Endpoints

**PATCH /api/orders/:id/status**
```python
# Update order status
@router.patch("/api/orders/{id}/status")
async def update_order_status(
    id: str,
    status: str,
    notes: Optional[str] = None
):
    # Validate status transition
    # Update orders table
    # Trigger will update worklist_items
    # Log to worklist_history
    # Return updated order
    pass
```
- [ ] Implemented
- [ ] Tested
- [ ] Documented

**POST /api/orders/:id/reschedule**
```python
# Reschedule order
@router.post("/api/orders/{id}/reschedule")
async def reschedule_order(
    id: str,
    new_scheduled_at: str,
    reason: Optional[str] = None
):
    # Release old slot
    # Update order scheduled_at
    # Update worklist_items
    # Log to worklist_history
    # Return updated order
    pass
```
- [ ] Implemented
- [ ] Tested
- [ ] Documented

**POST /api/orders/:id/cancel**
```python
# Cancel order
@router.post("/api/orders/{id}/cancel")
async def cancel_order(
    id: str,
    reason: str
):
    # Update order status to cancelled
    # Set cancelled_at, cancelled_by, cancelled_reason
    # Update worklist_items
    # Release schedule slot
    # Log to worklist_history
    # Return updated order
    pass
```
- [ ] Implemented
- [ ] Tested
- [ ] Documented

#### Schedule Endpoints

**GET /api/schedule/slots**
```python
# Get available schedule slots
@router.get("/api/schedule/slots")
async def get_available_slots(
    modality_id: Optional[str] = None,
    modality_type: Optional[str] = None,
    date: Optional[str] = None,
    duration_minutes: Optional[int] = None
):
    # Call get_available_slots() function
    # Return available slots
    pass
```
- [ ] Implemented
- [ ] Tested
- [ ] Documented

**POST /api/schedule/slots/:id/book**
```python
# Book a schedule slot
@router.post("/api/schedule/slots/{id}/book")
async def book_slot(
    id: str,
    order_id: str
):
    # Call book_schedule_slot() function
    # Return booking result
    pass
```
- [ ] Implemented
- [ ] Tested
- [ ] Documented

### 3. API Gateway Configuration

#### Update Routes
```python
# Add worklist routes to API Gateway
worklist_routes = [
    ("/api/worklist", "GET"),
    ("/api/worklist/{id}", "GET"),
    ("/api/worklist/summary", "GET"),
    ("/api/orders/{id}/status", "PATCH"),
    ("/api/orders/{id}/reschedule", "POST"),
    ("/api/orders/{id}/cancel", "POST"),
    ("/api/schedule/slots", "GET"),
    ("/api/schedule/slots/{id}/book", "POST"),
]
```
- [ ] Routes configured
- [ ] CORS enabled
- [ ] Authentication configured
- [ ] Rate limiting configured

### 4. Testing

#### Unit Tests
```python
# Test worklist queries
def test_get_worklist():
    # Test with filters
    # Test without filters
    # Test pagination
    pass

def test_update_order_status():
    # Test valid transitions
    # Test invalid transitions
    # Test status history
    pass

def test_reschedule_order():
    # Test valid reschedule
    # Test slot availability
    # Test history tracking
    pass
```
- [ ] Unit tests written
- [ ] All tests passing
- [ ] Coverage > 80%

#### Integration Tests
```python
# Test end-to-end workflows
def test_order_to_worklist_flow():
    # Create order
    # Schedule order
    # Verify worklist item created
    # Update status
    # Verify worklist updated
    pass

def test_reschedule_flow():
    # Create scheduled order
    # Get available slots
    # Reschedule order
    # Verify slot released/booked
    # Verify history
    pass
```
- [ ] Integration tests written
- [ ] All tests passing
- [ ] Edge cases covered

#### API Tests
```bash
# Test worklist endpoints
curl -X GET "http://localhost:8888/api/worklist?date=2025-11-18&modality=CT"
curl -X GET "http://localhost:8888/api/worklist/summary"
curl -X PATCH "http://localhost:8888/api/orders/123/status" \
  -H "Content-Type: application/json" \
  -d '{"status":"arrived","notes":"Patient checked in"}'
```
- [ ] All endpoints tested
- [ ] Response formats validated
- [ ] Error handling verified

### 5. Frontend Configuration

#### Enable Backend Mode
```javascript
// src/services/api-registry.js
worklist: {
  enabled: true,  // ✅ Already configured
  baseUrl: "http://103.42.117.19:8888",
  // ...
}
```
- [x] Registry configured
- [ ] Backend URL verified
- [ ] Health check passing

#### Test Integration
```bash
# Start frontend
npm run dev

# Navigate to worklist
http://localhost:5173/worklist

# Test features:
# - Worklist loads from backend
# - Filters work
# - Status updates work
# - Reschedule works
# - Cancel works
# - Upload works
```
- [ ] Worklist loads
- [ ] Filters functional
- [ ] Status updates work
- [ ] Reschedule functional
- [ ] Cancel functional
- [ ] Upload integration works

---

## 🚀 Deployment Checklist

### Pre-Deployment

#### Database
- [ ] Migration tested in staging
- [ ] Indexes verified
- [ ] Triggers tested
- [ ] Functions tested
- [ ] Performance tested

#### Backend
- [ ] All endpoints implemented
- [ ] All tests passing
- [ ] API documentation updated
- [ ] Error handling verified
- [ ] Logging configured

#### Frontend
- [ ] Build successful
- [ ] No console errors
- [ ] All features tested
- [ ] Performance optimized
- [ ] Accessibility verified

### Staging Deployment

#### Database
```bash
# Run migration in staging
psql -U postgres -h staging-db -d pacs_db \
  -f pacs-service/migrations/006_create_worklist_tables.sql

# Verify
psql -U postgres -h staging-db -d pacs_db -c "\dt worklist*"
```
- [ ] Migration successful
- [ ] Tables created
- [ ] Triggers active
- [ ] Functions working

#### Backend
```bash
# Deploy backend to staging
docker build -t pacs-backend:worklist .
docker push registry/pacs-backend:worklist
kubectl apply -f k8s/staging/backend.yaml
```
- [ ] Backend deployed
- [ ] Health check passing
- [ ] Endpoints accessible
- [ ] Logs clean

#### Frontend
```bash
# Build and deploy frontend
npm run build
rsync -avz dist/ staging:/var/www/pacs/
```
- [ ] Frontend deployed
- [ ] Assets loaded
- [ ] API connectivity verified
- [ ] Features working

### Staging Testing

#### Functional Testing
- [ ] Worklist displays correctly
- [ ] Filters work
- [ ] Status transitions work
- [ ] Reschedule works
- [ ] Cancel works
- [ ] Upload integration works

#### Performance Testing
- [ ] Page load < 2s
- [ ] API response < 500ms
- [ ] No memory leaks
- [ ] Concurrent users tested

#### Security Testing
- [ ] Authentication required
- [ ] Authorization enforced
- [ ] SQL injection prevented
- [ ] XSS prevented
- [ ] CSRF protection enabled

### Production Deployment

#### Pre-Production
- [ ] Staging tests passed
- [ ] Stakeholder approval
- [ ] Deployment plan reviewed
- [ ] Rollback plan ready
- [ ] Monitoring configured

#### Production Database
```bash
# Backup first!
pg_dump -U postgres -h prod-db pacs_db > backup_pre_worklist.sql

# Run migration
psql -U postgres -h prod-db -d pacs_db \
  -f pacs-service/migrations/006_create_worklist_tables.sql
```
- [ ] Backup created
- [ ] Migration successful
- [ ] Verification complete

#### Production Backend
```bash
# Deploy with zero downtime
kubectl set image deployment/pacs-backend \
  backend=registry/pacs-backend:worklist
kubectl rollout status deployment/pacs-backend
```
- [ ] Deployment successful
- [ ] Health checks passing
- [ ] No errors in logs

#### Production Frontend
```bash
# Deploy frontend
npm run build
rsync -avz dist/ production:/var/www/pacs/
```
- [ ] Deployment successful
- [ ] Cache cleared
- [ ] Assets accessible

### Post-Deployment

#### Verification
- [ ] Worklist accessible
- [ ] All features working
- [ ] No errors in logs
- [ ] Performance acceptable
- [ ] Users notified

#### Monitoring
- [ ] Error rate normal
- [ ] Response times good
- [ ] Database performance good
- [ ] No alerts triggered

---

## 📊 Success Metrics

### Technical Metrics
- [ ] API response time < 500ms
- [ ] Page load time < 2s
- [ ] Error rate < 0.1%
- [ ] Uptime > 99.9%

### User Metrics
- [ ] User adoption > 80%
- [ ] User satisfaction > 4/5
- [ ] Support tickets < 5/week
- [ ] Training completion > 90%

---

## 🐛 Known Issues & Limitations

### Current Limitations
- [ ] No real-time updates (WebSocket not implemented)
- [ ] No mobile app (web only)
- [ ] No offline support
- [ ] No bulk operations

### Future Enhancements
- [ ] Real-time updates via WebSocket
- [ ] Mobile app development
- [ ] Offline support with service workers
- [ ] Bulk status updates
- [ ] Advanced analytics
- [ ] Calendar view for scheduling

---

## 📞 Support & Contacts

### Development Team
- **Frontend**: [Team Contact]
- **Backend**: [Team Contact]
- **Database**: [Team Contact]
- **DevOps**: [Team Contact]

### Documentation
- System Docs: `docs/WORKLIST_SYSTEM_DOCUMENTATION.md`
- UI Docs: `docs/WORKLIST_UI_IMPLEMENTATION.md`
- Quick Start: `docs/WORKLIST_QUICK_START.md`
- This Checklist: `docs/WORKLIST_INTEGRATION_CHECKLIST.md`

### Emergency Contacts
- **On-Call**: [Contact]
- **Manager**: [Contact]
- **Escalation**: [Contact]

---

## ✅ Sign-Off

### Development
- [ ] Frontend Lead: _________________ Date: _______
- [ ] Backend Lead: _________________ Date: _______
- [ ] QA Lead: _________________ Date: _______

### Operations
- [ ] DevOps Lead: _________________ Date: _______
- [ ] DBA: _________________ Date: _______

### Management
- [ ] Product Manager: _________________ Date: _______
- [ ] Technical Lead: _________________ Date: _______

---

**Last Updated**: November 18, 2025  
**Version**: 1.0  
**Status**: Ready for Backend Integration
