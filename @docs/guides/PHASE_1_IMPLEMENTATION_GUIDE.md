# Phase 1: UI/UX Refactoring - Implementation Guide
**Duration**: 4-6 weeks  
**Priority**: HIGH  
**Goal**: Transform UI to professional PACS interface

---

## Week 1-2: Layout & Navigation System

### Day 1-2: Setup & Dependencies

#### Install Required Packages
```bash
# Frontend dependencies
npm install --save \
  @cornerstonejs/core \
  @cornerstonejs/tools \
  @cornerstonejs/dicom-image-loader \
  @cornerstonejs/streaming-image-volume-loader \
  cornerstone-wado-image-loader \
  dicom-parser \
  dcmjs \
  react-split-pane \
  react-grid-layout \
  react-virtualized \
  react-window

# UI enhancements
npm install --save \
  @headlessui/react \
  @heroicons/react \
  react-hot-toast \
  react-tooltip \
  react-modal

# Development dependencies
npm install --save-dev \
  @testing-library/react \
  @testing-library/jest-dom \
  vitest
```

#### Create Directory Structure
```bash
# Create new directories
mkdir -p src/layouts
mkdir -p src/components/navigation
mkdir -p src/components/workspace
mkdir -p src/components/viewer/core
mkdir -p src/components/viewer/tools
mkdir -p src/components/viewer/panels
mkdir -p src/components/studies
mkdir -p src/components/reporting/editor
mkdir -p src/components/reporting/workflow
mkdir -p src/hooks/viewer
mkdir -p src/utils/viewer
mkdir -p src/services/reporting
mkdir -p src/pages/viewer
mkdir -p src/pages/studies
mkdir -p src/pages/reporting
```

### Day 3-5: PACS Layout System

#### Step 1: Create Base PACS Layout
**File**: `src/layouts/PACSLayout.jsx`

```jsx
import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import PACSNavbar from '../components/navigation/PACSNavbar';
import WorklistPanel from '../components/navigation/WorklistPanel';
import StatusBar from '../components/navigation/StatusBar';

const PACSLayout = () => {
  const [worklistVisible, setWorklistVisible] = useState(true);
  const [worklistWidth, setWorklistWidth] = useState(300);

  return (
    <div className="flex flex-col h-screen bg-gray-900">
      {/* Top Navigation */}
      <PACSNavbar 
        onToggleWorklist={() => setWorklistVisible(!worklistVisible)}
        worklistVisible={worklistVisible}
      />

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Worklist */}
        {worklistVisible && (
          <WorklistPanel 
            width={worklistWidth}
            onResize={setWorklistWidth}
          />
        )}

        {/* Main Workspace */}
        <main className="flex-1 overflow-auto bg-gray-800">
          <Outlet />
        </main>
      </div>

      {/* Bottom Status Bar */}
      <StatusBar />
    </div>
  );
};

export default PACSLayout;
```

#### Step 2: Create PACS Navbar
**File**: `src/components/navigation/PACSNavbar.jsx`

```jsx
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  Bars3Icon, 
  MagnifyingGlassIcon,
  BellIcon,
  Cog6ToothIcon,
  UserCircleIcon
} from '@heroicons/react/24/outline';
import SearchBar from '../common/SearchBar';
import NotificationCenter from '../common/NotificationCenter';

const PACSNavbar = ({ onToggleWorklist, worklistVisible }) => {
  const location = useLocation();

  const navItems = [
    { path: '/worklist', label: 'Worklist', icon: '📋' },
    { path: '/studies', label: 'Studies', icon: '🔍' },
    { path: '/viewer', label: 'Viewer', icon: '🖼️' },
    { path: '/reports', label: 'Reports', icon: '📄' },
    { path: '/admin', label: 'Admin', icon: '⚙️' },
  ];

  return (
    <nav className="bg-gray-900 border-b border-gray-700 px-4 py-2">
      <div className="flex items-center justify-between">
        {/* Left Section */}
        <div className="flex items-center space-x-4">
          {/* Toggle Worklist Button */}
          <button
            onClick={onToggleWorklist}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded"
            title="Toggle Worklist"
          >
            <Bars3Icon className="w-6 h-6" />
          </button>

          {/* Logo */}
          <Link to="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
              <span className="text-white font-bold">P</span>
            </div>
            <span className="text-white font-semibold text-lg">PACS System</span>
          </Link>

          {/* Navigation Items */}
          <div className="flex space-x-1 ml-8">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                  location.pathname.startsWith(item.path)
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`}
              >
                <span className="mr-2">{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Center Section - Search */}
        <div className="flex-1 max-w-2xl mx-8">
          <SearchBar />
        </div>

        {/* Right Section */}
        <div className="flex items-center space-x-2">
          {/* Notifications */}
          <NotificationCenter />

          {/* Settings */}
          <Link
            to="/settings"
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded"
            title="Settings"
          >
            <Cog6ToothIcon className="w-6 h-6" />
          </Link>

          {/* User Menu */}
          <button
            className="flex items-center space-x-2 p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded"
            title="User Menu"
          >
            <UserCircleIcon className="w-6 h-6" />
            <span className="text-sm">Dr. User</span>
          </button>
        </div>
      </div>
    </nav>
  );
};

export default PACSNavbar;
```

#### Step 3: Create Worklist Panel
**File**: `src/components/navigation/WorklistPanel.jsx`

```jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadData } from '../../services/dataSync';

const WorklistPanel = ({ width, onResize }) => {
  const [worklist, setWorklist] = useState([]);
  const [filter, setFilter] = useState('all');
  const navigate = useNavigate();

  useEffect(() => {
    loadWorklist();
  }, [filter]);

  const loadWorklist = async () => {
    try {
      const orders = await loadData('orders');
      let filtered = orders;

      if (filter === 'pending') {
        filtered = orders.filter(o => o.status === 'scheduled' || o.status === 'in_progress');
      } else if (filter === 'today') {
        const today = new Date().toISOString().split('T')[0];
        filtered = orders.filter(o => o.studyDate?.startsWith(today));
      }

      setWorklist(filtered.slice(0, 50)); // Limit to 50 items
    } catch (error) {
      console.error('Failed to load worklist:', error);
    }
  };

  const handleStudyClick = (order) => {
    navigate(`/viewer/${order.id}`);
  };

  return (
    <div 
      className="bg-gray-900 border-r border-gray-700 flex flex-col"
      style={{ width: `${width}px` }}
    >
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-white font-semibold mb-3">Worklist</h2>
        
        {/* Filter Tabs */}
        <div className="flex space-x-2">
          {['all', 'today', 'pending'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 text-xs rounded ${
                filter === f
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Worklist Items */}
      <div className="flex-1 overflow-y-auto">
        {worklist.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            No studies in worklist
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {worklist.map((order) => (
              <div
                key={order.id}
                onClick={() => handleStudyClick(order)}
                className="p-3 hover:bg-gray-800 cursor-pointer transition-colors"
              >
                <div className="text-white text-sm font-medium truncate">
                  {order.patientName || 'Unknown Patient'}
                </div>
                <div className="text-gray-400 text-xs mt-1">
                  {order.patientId || 'No ID'}
                </div>
                <div className="text-gray-500 text-xs mt-1">
                  {order.modality} • {order.studyDate}
                </div>
                <div className="mt-2">
                  <span className={`inline-block px-2 py-0.5 text-xs rounded ${
                    order.status === 'completed' ? 'bg-green-900 text-green-300' :
                    order.status === 'in_progress' ? 'bg-blue-900 text-blue-300' :
                    'bg-gray-800 text-gray-400'
                  }`}>
                    {order.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-gray-700 text-center">
        <button
          onClick={loadWorklist}
          className="text-blue-400 hover:text-blue-300 text-sm"
        >
          Refresh
        </button>
      </div>
    </div>
  );
};

export default WorklistPanel;
```

#### Step 4: Create Status Bar
**File**: `src/components/navigation/StatusBar.jsx`

```jsx
import React, { useState, useEffect } from 'react';
import { useBackendHealth } from '../../hooks/useBackend';

const StatusBar = () => {
  const { status, modules } = useBackendHealth();
  const [storageInfo, setStorageInfo] = useState(null);

  useEffect(() => {
    // Load storage info
    fetchStorageInfo();
  }, []);

  const fetchStorageInfo = async () => {
    try {
      // Implement storage info fetch
      setStorageInfo({
        used: '45.2 GB',
        total: '500 GB',
        percentage: 9
      });
    } catch (error) {
      console.error('Failed to fetch storage info:', error);
    }
  };

  return (
    <div className="bg-gray-900 border-t border-gray-700 px-4 py-2">
      <div className="flex items-center justify-between text-xs">
        {/* Left Section */}
        <div className="flex items-center space-x-6">
          {/* Connection Status */}
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${
              status === 'healthy' ? 'bg-green-500' :
              status === 'degraded' ? 'bg-yellow-500' :
              'bg-red-500'
            }`} />
            <span className="text-gray-400">
              {status === 'healthy' ? 'Connected' :
               status === 'degraded' ? 'Degraded' :
               'Disconnected'}
            </span>
          </div>

          {/* Storage Info */}
          {storageInfo && (
            <div className="text-gray-400">
              Storage: {storageInfo.used} / {storageInfo.total} ({storageInfo.percentage}%)
            </div>
          )}

          {/* Active Tasks */}
          <div className="text-gray-400">
            Tasks: 0 active
          </div>
        </div>

        {/* Right Section */}
        <div className="flex items-center space-x-6">
          {/* Module Status */}
          <div className="flex items-center space-x-3">
            {Object.entries(modules).map(([name, mod]) => (
              <div key={name} className="flex items-center space-x-1">
                <div className={`w-1.5 h-1.5 rounded-full ${
                  mod.status === 'healthy' ? 'bg-green-500' : 'bg-red-500'
                }`} />
                <span className="text-gray-500">{name}</span>
              </div>
            ))}
          </div>

          {/* Timestamp */}
          <div className="text-gray-500">
            {new Date().toLocaleTimeString()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatusBar;
```

#### Step 5: Update App.jsx
**File**: `src/App.jsx` (Add new routes)

```jsx
// Add to imports
import PACSLayout from './layouts/PACSLayout';
import ViewerLayout from './layouts/ViewerLayout';

// Update routes
<Routes>
  {/* PACS Routes */}
  <Route element={<PACSLayout />}>
    <Route path="/worklist" element={<Worklist />} />
    <Route path="/studies" element={<StudyList />} />
    <Route path="/reports" element={<ReportList />} />
    {/* ... other routes */}
  </Route>

  {/* Viewer Routes (Full Screen) */}
  <Route element={<ViewerLayout />}>
    <Route path="/viewer/:studyId" element={<DicomViewer />} />
  </Route>

  {/* ... existing routes */}
</Routes>
```

### Day 6-7: Common Components

#### Create Search Bar
**File**: `src/components/common/SearchBar.jsx`

```jsx
import React, { useState } from 'react';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { useNavigate } from 'react-router-dom';

const SearchBar = () => {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  const handleSearch = (e) => {
    e.preventDefault();
    if (query.trim()) {
      navigate(`/studies?search=${encodeURIComponent(query)}`);
    }
  };

  return (
    <form onSubmit={handleSearch} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by Patient Name, ID, Accession Number..."
        className="w-full bg-gray-800 text-white px-4 py-2 pl-10 rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none"
      />
      <MagnifyingGlassIcon className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" />
    </form>
  );
};

export default SearchBar;
```

#### Create Notification Center
**File**: `src/components/common/NotificationCenter.jsx`

```jsx
import React, { useState } from 'react';
import { BellIcon } from '@heroicons/react/24/outline';

const NotificationCenter = () => {
  const [notifications, setNotifications] = useState([]);
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded relative"
        title="Notifications"
      >
        <BellIcon className="w-6 h-6" />
        {notifications.length > 0 && (
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-gray-800 rounded-lg shadow-xl border border-gray-700 z-50">
          <div className="p-4 border-b border-gray-700">
            <h3 className="text-white font-semibold">Notifications</h3>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                No notifications
              </div>
            ) : (
              notifications.map((notif, idx) => (
                <div key={idx} className="p-4 border-b border-gray-700 hover:bg-gray-700">
                  <div className="text-white text-sm">{notif.message}</div>
                  <div className="text-gray-500 text-xs mt-1">{notif.time}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationCenter;
```

---

## Week 3-4: Study List Enhancement

### Implementation Steps

1. **Create Study List Page** (`src/pages/studies/StudyList.jsx`)
2. **Create Study Grid View** (`src/pages/studies/StudyGrid.jsx`)
3. **Create Study Filters** (`src/pages/studies/StudyFilters.jsx`)
4. **Create Study Card** (`src/components/studies/StudyCard.jsx`)
5. **Implement Virtual Scrolling**
6. **Add Batch Operations**

### Key Features to Implement
- Advanced filtering (date range, modality, status)
- Thumbnail preview
- Virtual scrolling for performance
- Drag-and-drop to viewer
- Export to CSV/PDF
- Batch operations (delete, export, route)

---

## Week 5-8: DICOM Viewer Transformation

### Implementation Steps

1. **Setup Cornerstone.js**
2. **Create Viewport Canvas**
3. **Implement Windowing Tools**
4. **Add Measurement Tools**
5. **Create Multi-Viewport Support**
6. **Implement Hanging Protocols**
7. **Add Cine Playback**

### Key Components
- ViewportCanvas (Cornerstone integration)
- ViewerToolbar (tool selection)
- WindowingPanel (W/L controls)
- MeasurementTools (distance, angle, ROI)
- ViewportGrid (multi-viewport)
- CineControls (playback)

---

## Testing Strategy

### Unit Tests
```javascript
// Example: Layout.test.jsx
import { render, screen } from '@testing-library/react';
import PACSLayout from '../layouts/PACSLayout';

describe('PACSLayout', () => {
  it('renders navbar', () => {
    render(<PACSLayout />);
    expect(screen.getByText('PACS System')).toBeInTheDocument();
  });

  it('toggles worklist panel', () => {
    // Test implementation
  });
});
```

### Integration Tests
- Test navigation between pages
- Test worklist interaction
- Test study selection
- Test viewer launch

### Manual Testing Checklist
- [ ] Layout renders correctly
- [ ] Navigation works
- [ ] Worklist loads
- [ ] Search functions
- [ ] Notifications work
- [ ] Status bar updates
- [ ] Responsive design
- [ ] Dark theme consistent

---

## Performance Optimization

### Techniques to Apply
1. **Code Splitting**: Lazy load routes
2. **Virtual Scrolling**: For large lists
3. **Memoization**: React.memo for components
4. **Debouncing**: For search and filters
5. **Image Lazy Loading**: For thumbnails
6. **Web Workers**: For heavy computations

---

## Accessibility

### Requirements
- Keyboard navigation
- ARIA labels
- Screen reader support
- High contrast mode
- Focus indicators

---

## Browser Compatibility

### Target Browsers
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

### Testing
- Test on all target browsers
- Test on different screen sizes
- Test with different zoom levels

---

## Documentation

### Required Documentation
1. Component API documentation
2. Usage examples
3. Styling guide
4. Accessibility guide
5. Performance guide

---

## Next Steps After Phase 1

1. Review and test all components
2. Gather user feedback
3. Fix bugs and issues
4. Optimize performance
5. Begin Phase 2: Core PACS Features

---

**Last Updated**: 2025-11-15  
**Status**: READY FOR IMPLEMENTATION  
**Estimated Completion**: 4-6 weeks
