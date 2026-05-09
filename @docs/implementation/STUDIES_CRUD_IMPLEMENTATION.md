# Studies CRUD Implementation

## Overview
Complete CRUD (Create, Read, Update, Delete) functionality for DICOM Studies management with backend/mock data support.

## Files Created/Modified

### New Files
- `src/services/studiesService.js` - Studies data service with backend/mock support

### Modified Files
- `src/pages/Studies.jsx` - Added full CRUD UI with modal form
- `src/services/api-registry.js` - Added studies module configuration

## Features Implemented

### 1. List Studies (Read)
- ✅ Load studies from backend or mock data
- ✅ Filter by search query (patient name, MRN, accession, description)
- ✅ Filter by modality (CT, MR, US, XA, CR, DR)
- ✅ Filter by date range (from/to)
- ✅ Sort by date/time descending
- ✅ Expandable series details per study
- ✅ Storage indicator (browser/server/external)

### 2. Create Study
- ✅ Modal form with all required fields
- ✅ Study information: date, time, accession, description, modality, status
- ✅ Patient information: name, MRN, birth date
- ✅ Auto-generate study ID and UID
- ✅ Success notification
- ✅ Refresh list after creation

### 3. Update Study
- ✅ Edit button on each study row
- ✅ Pre-populate form with existing data
- ✅ Update all study fields
- ✅ Success notification
- ✅ Refresh list after update

### 4. Delete Study
- ✅ Delete button on each study row
- ✅ Confirmation dialog
- ✅ Success notification
- ✅ Refresh list after deletion

### 5. View Study Details
- ✅ Show/Hide series button
- ✅ Display series table with:
  - Series number
  - Series UID
  - Modality
  - Description
  - Instance count
  - Open series action

## UI Components

### Action Buttons
- **Show/Hide** - Toggle series details (gray)
- **View** - Open DICOM viewer (blue)
- **Edit** - Edit study (green)
- **Delete** - Delete study (red)
- **Add Study** - Create new study (blue, top-right)

### Form Modal
- Overlay with centered modal
- Two-column layout for compact fields
- Patient information section
- Submit/Cancel buttons
- Responsive design

## API Integration

### Backend Mode (when enabled)
```javascript
// Configure in api-registry.js
studies: {
  enabled: true,
  baseUrl: "http://localhost:8003",
  healthPath: "/health",
  timeoutMs: 6000
}
```

### Expected Backend Endpoints
- `GET /api/studies` - List studies with filters
- `GET /api/studies/:id` - Get single study
- `POST /api/studies` - Create study
- `PUT /api/studies/:id` - Update study
- `DELETE /api/studies/:id` - Delete study

### Mock Mode (default)
- Uses `src/data/studies.json`
- In-memory operations
- Persists during session only

## Data Structure

### Study Object
```javascript
{
  studyId: "STU-CT-01",
  studyInstanceUID: "1.2.826.0.1.3680043.2.1125...",
  studyDate: "2025-11-15",
  studyTime: "08:30:00",
  accessionNumber: "ACC-2025-00101",
  description: "CT Head Non-Contrast",
  modality: "CT",
  status: "completed",
  patient: {
    name: "Andi Saputra",
    mrn: "MRN0001",
    birthDate: "1988-04-12"
  },
  series: [...]
}
```

## Usage

### Enable Backend
1. Open Settings → Integration
2. Navigate to Studies section
3. Toggle "Enable Backend"
4. Configure base URL
5. Save settings

### Create Study
1. Click "Add Study" button
2. Fill in study information
3. Fill in patient information
4. Click "Create Study"

### Edit Study
1. Find study in list
2. Click "Edit" button
3. Modify fields
4. Click "Update Study"

### Delete Study
1. Find study in list
2. Click "Delete" button
3. Confirm deletion

### View Series
1. Find study in list
2. Click "Show" button
3. View series table
4. Click "Hide" to collapse

## Notifications
- Success messages for create/update/delete
- Error messages for failed operations
- Automatic fallback to mock data on backend failure

## Future Enhancements
- [ ] Bulk operations (delete multiple)
- [ ] Export studies to CSV/JSON
- [ ] Advanced filters (status, patient age range)
- [ ] Study statistics dashboard
- [ ] Series CRUD operations
- [ ] Instance management
- [ ] DICOM upload integration
- [ ] Viewer integration
- [ ] Print/PDF export
- [ ] Share study links

## Testing

### Manual Testing
1. **List**: Verify studies load and display correctly
2. **Filter**: Test search, modality, and date filters
3. **Create**: Add new study with all fields
4. **Edit**: Modify existing study
5. **Delete**: Remove study with confirmation
6. **Series**: Expand/collapse series details

### Backend Testing
1. Enable backend in settings
2. Verify API calls in Network tab
3. Test error handling (disconnect backend)
4. Verify fallback to mock data

## Notes
- Mock data persists only during session
- Backend mode requires PACS service running
- Storage indicator shows current data source
- Form validation ensures required fields
- Confirmation dialog prevents accidental deletion
