# PACS UI Components Guide
**Quick Reference for Developers**

---

## 📐 Layout System

### PACSLayout
Main layout for PACS workspace with sidebar and status bar.

```jsx
import PACSLayout from './layouts/PACSLayout';

// Usage in App.jsx
<Route element={<PACSLayout />}>
  <Route path="/studies" element={<StudyList />} />
  <Route path="/worklist" element={<Worklist />} />
</Route>
```

**Features:**
- Collapsible worklist panel
- Top navigation bar
- Bottom status bar
- Main content area

### ViewerLayout
Full-screen layout for DICOM viewer.

```jsx
import ViewerLayout from './layouts/ViewerLayout';

// Usage
<Route element={<ViewerLayout />}>
  <Route path="/viewer/:studyId" element={<DicomViewer />} />
</Route>
```

**Features:**
- Minimal UI for maximum viewing area
- Compact status bar
- No sidebars

---

## 🧭 Navigation Components

### PACSNavbar
Top navigation with search, notifications, and user menu.

```jsx
import PACSNavbar from './components/navigation/PACSNavbar';

<PACSNavbar 
  onToggleWorklist={() => setWorklistOpen(!worklistOpen)}
  worklistOpen={worklistOpen}
/>
```

**Props:**
- `onToggleWorklist`: Function to toggle worklist panel
- `worklistOpen`: Boolean for worklist state

**Features:**
- Global search bar
- Notification center
- User menu with logout
- Settings access

### WorklistPanel
Left sidebar showing worklist items.

```jsx
import WorklistPanel from './components/navigation/WorklistPanel';

<WorklistPanel 
  onClose={() => setWorklistOpen(false)}
  onStudySelect={(studyId) => navigate(`/viewer/${studyId}`)}
/>
```

**Props:**
- `onClose`: Function to close panel
- `onStudySelect`: Function called when study is selected

**Features:**
- Filter by status (all, pending, in-progress, completed)
- Study cards with patient info
- Priority indicators
- Statistics footer

### StatusBar
Bottom status bar showing system information.

```jsx
import StatusBar from './components/navigation/StatusBar';

<StatusBar minimal={false} />
```

**Props:**
- `minimal`: Boolean for compact mode

**Features:**
- PACS connection status
- Storage usage indicator
- Active tasks counter
- Last sync time

### QuickActions
Right sidebar for quick access to actions.

```jsx
import QuickActions from './components/navigation/QuickActions';

<QuickActions onClose={() => setQuickActionsOpen(false)} />
```

**Props:**
- `onClose`: Function to close panel

**Features:**
- New order button
- Search study button
- New report button

---

## 🔍 Study Components

### StudyGrid
Card-based grid view for studies.

```jsx
import StudyGrid from './pages/studies/StudyGrid';

<StudyGrid
  studies={filteredStudies}
  onStudySelect={setSelectedStudy}
  onView={handleViewStudy}
/>
```

**Props:**
- `studies`: Array of study objects
- `onStudySelect`: Function called when study card is clicked
- `onView`: Function called when view button is clicked

**Study Object Structure:**
```javascript
{
  id: number,
  patientName: string,
  patientId: string,
  studyDescription: string,
  studyDate: string,
  modality: string,
  status: 'completed' | 'in-progress' | 'pending',
  priority: 'routine' | 'urgent',
  numberOfSeries: number,
  numberOfInstances: number
}
```

### StudyTable
Table view for studies with sorting.

```jsx
import StudyTable from './pages/studies/StudyTable';

<StudyTable
  studies={filteredStudies}
  onStudySelect={setSelectedStudy}
  onView={handleViewStudy}
  onReport={handleReportStudy}
/>
```

**Props:**
- `studies`: Array of study objects
- `onStudySelect`: Function for row click
- `onView`: Function for view action
- `onReport`: Function for report action

**Features:**
- Checkbox selection
- Sortable columns
- Action menu per row
- Hover effects

### StudyFilters
Advanced filtering panel.

```jsx
import StudyFilters from './components/studies/StudyFilters';

<StudyFilters 
  onFilterChange={setFilters}
  onClose={() => setFiltersOpen(false)}
/>
```

**Props:**
- `onFilterChange`: Function called with filter object
- `onClose`: Optional function to close panel

**Filter Object Structure:**
```javascript
{
  dateFrom: string,      // YYYY-MM-DD
  dateTo: string,        // YYYY-MM-DD
  modality: string,      // CT, MRI, XR, etc.
  status: string,        // pending, in-progress, completed
  patientName: string,
  accessionNumber: string,
  studyDescription: string
}
```

### StudyDetails
Slide-out panel showing study details.

```jsx
import StudyDetails from './components/studies/StudyDetails';

<StudyDetails
  study={selectedStudy}
  onClose={() => setSelectedStudy(null)}
/>
```

**Props:**
- `study`: Study object with full details
- `onClose`: Function to close panel

**Features:**
- Patient information
- Study information
- Series list with thumbnails
- Additional metadata

### StudyActions
Action menu for study operations.

```jsx
import StudyActions from './components/studies/StudyActions';

<StudyActions
  study={study}
  onView={handleView}
  onReport={handleReport}
  onExport={handleExport}
  onShare={handleShare}
  onDelete={handleDelete}
/>
```

**Props:**
- `study`: Study object
- `onView`: View study function
- `onReport`: Create report function
- `onExport`: Export DICOM function
- `onShare`: Share study function
- `onDelete`: Delete study function

---

## 🔧 Common Components

### SearchBar
Global search with autocomplete.

```jsx
import SearchBar from './components/common/SearchBar';

<SearchBar onClose={() => setSearchOpen(false)} />
```

**Props:**
- `onClose`: Function to close search results

**Features:**
- Real-time search
- Result categorization (study, patient)
- Keyboard navigation

### NotificationCenter
Notification dropdown.

```jsx
import NotificationCenter from './components/common/NotificationCenter';

<NotificationCenter onClose={() => setNotificationsOpen(false)} />
```

**Props:**
- `onClose`: Function to close dropdown

**Features:**
- Notification list
- Type indicators (success, warning, info)
- Read/unread status
- Time stamps

### ConnectionStatus
System connection indicator.

```jsx
import ConnectionStatus from './components/common/ConnectionStatus';

<ConnectionStatus status="connected" />
```

**Props:**
- `status`: 'connected' | 'disconnected'

---

## 📊 Data Structures

### Study Object (Enhanced)
```javascript
{
  id: 1,
  patientName: "John Doe",
  patientId: "P001",
  patientDOB: "1975-03-15",
  patientGender: "M",
  accessionNumber: "ACC20251115001",
  studyInstanceUID: "1.2.840.113619...",
  studyDate: "2025-11-15",
  studyTime: "09:30:00",
  studyDescription: "CT Brain without Contrast",
  modality: "CT",
  status: "completed",
  priority: "routine",
  referringPhysician: "Dr. Sarah Johnson",
  institution: "General Hospital",
  numberOfSeries: 3,
  numberOfInstances: 150,
  series: [
    {
      seriesNumber: 1,
      seriesDescription: "Axial Brain",
      instanceCount: 50,
      modality: "CT"
    }
  ],
  thumbnailUrl: "/api/studies/1/thumbnail"
}
```

### Worklist Item
```javascript
{
  id: 1,
  patientName: "John Doe",
  patientId: "P001",
  accessionNumber: "ACC001",
  modality: "CT",
  studyDescription: "CT Brain",
  scheduledTime: "2025-11-15 09:00",
  status: "pending",
  priority: "routine"
}
```

### Notification Object
```javascript
{
  id: 1,
  type: "success" | "warning" | "info" | "error",
  title: "Study uploaded successfully",
  message: "CT Brain study has been archived",
  time: "5 min ago",
  read: false
}
```

---

## 🎨 Styling Guidelines

### Color Scheme
```css
/* Primary Colors */
--blue-900: #1e3a8a;  /* Navbar background */
--blue-800: #1e40af;  /* Navbar gradient */
--blue-600: #2563eb;  /* Primary buttons */
--blue-500: #3b82f6;  /* Links, accents */

/* Status Colors */
--green-500: #22c55e;  /* Success, completed */
--yellow-500: #eab308; /* Warning, pending */
--red-500: #ef4444;    /* Error, urgent */
--gray-500: #6b7280;   /* Neutral */

/* Background Colors */
--gray-50: #f9fafb;    /* Page background */
--white: #ffffff;      /* Card background */
--gray-900: #111827;   /* Status bar */
```

### Spacing
```css
/* Standard spacing scale (Tailwind) */
p-2: 0.5rem   /* 8px */
p-3: 0.75rem  /* 12px */
p-4: 1rem     /* 16px */
p-6: 1.5rem   /* 24px */
p-8: 2rem     /* 32px */
```

### Typography
```css
/* Font sizes */
text-xs: 0.75rem    /* 12px */
text-sm: 0.875rem   /* 14px */
text-base: 1rem     /* 16px */
text-lg: 1.125rem   /* 18px */
text-xl: 1.25rem    /* 20px */
text-2xl: 1.5rem    /* 24px */
```

---

## 🚀 Usage Examples

### Complete Study List Page
```jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StudyGrid from './pages/studies/StudyGrid';
import StudyTable from './pages/studies/StudyTable';
import StudyFilters from './components/studies/StudyFilters';
import StudyDetails from './components/studies/StudyDetails';

export default function StudyListPage() {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState('grid');
  const [filters, setFilters] = useState({});
  const [selectedStudy, setSelectedStudy] = useState(null);
  const [studies, setStudies] = useState([]);

  const handleViewStudy = (study) => {
    navigate(`/viewer/${study.id}`);
  };

  const handleReportStudy = (study) => {
    navigate(`/reports/new?studyId=${study.id}`);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="bg-white border-b p-4">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-semibold">Studies</h1>
          <div className="flex gap-2">
            <button onClick={() => setViewMode('grid')}>Grid</button>
            <button onClick={() => setViewMode('table')}>Table</button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <StudyFilters onFilterChange={setFilters} />

      {/* Content */}
      <div className="flex-1 overflow-hidden relative">
        {viewMode === 'grid' ? (
          <StudyGrid
            studies={studies}
            onStudySelect={setSelectedStudy}
            onView={handleViewStudy}
          />
        ) : (
          <StudyTable
            studies={studies}
            onStudySelect={setSelectedStudy}
            onView={handleViewStudy}
            onReport={handleReportStudy}
          />
        )}

        {selectedStudy && (
          <StudyDetails
            study={selectedStudy}
            onClose={() => setSelectedStudy(null)}
          />
        )}
      </div>
    </div>
  );
}
```

### Complete PACS Layout Integration
```jsx
import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import PACSNavbar from './components/navigation/PACSNavbar';
import WorklistPanel from './components/navigation/WorklistPanel';
import StatusBar from './components/navigation/StatusBar';

export default function PACSLayout() {
  const [worklistOpen, setWorklistOpen] = useState(true);

  return (
    <div className="h-screen flex flex-col">
      <PACSNavbar 
        onToggleWorklist={() => setWorklistOpen(!worklistOpen)}
        worklistOpen={worklistOpen}
      />

      <div className="flex-1 flex overflow-hidden">
        {worklistOpen && (
          <WorklistPanel 
            onClose={() => setWorklistOpen(false)}
            onStudySelect={(id) => console.log('Selected:', id)}
          />
        )}

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>

      <StatusBar />
    </div>
  );
}
```

---

## 📝 Best Practices

### Component Design
1. Keep components small and focused
2. Use props for configuration
3. Implement proper prop types
4. Handle loading and error states
5. Make components reusable

### State Management
1. Use local state when possible
2. Lift state up when needed
3. Consider Context API for global state
4. Use useMemo for expensive computations
5. Implement proper cleanup in useEffect

### Performance
1. Memoize expensive operations
2. Use virtual scrolling for large lists
3. Implement lazy loading
4. Optimize re-renders
5. Use proper keys in lists

### Accessibility
1. Use semantic HTML
2. Add proper ARIA labels
3. Ensure keyboard navigation
4. Maintain proper contrast ratios
5. Test with screen readers

---

## 🐛 Troubleshooting

### Common Issues

**Issue**: Components not rendering
- Check import paths
- Verify component exports
- Check for syntax errors

**Issue**: Filters not working
- Verify filter object structure
- Check filter logic in parent component
- Console.log filter values

**Issue**: Navigation not working
- Check React Router setup
- Verify route paths
- Check navigate function usage

**Issue**: Styling not applied
- Verify Tailwind CSS is configured
- Check class name spelling
- Ensure no CSS conflicts

---

## 📚 Additional Resources

- [React Documentation](https://react.dev)
- [Tailwind CSS Documentation](https://tailwindcss.com)
- [React Router Documentation](https://reactrouter.com)
- [Heroicons](https://heroicons.com)

---

**Last Updated**: 2025-11-15  
**Version**: 1.0  
**Maintainer**: PACS Development Team
