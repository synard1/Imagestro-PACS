# Data Storage Mechanisms in MWL-PACS UI

This document provides a comprehensive overview of the data storage mechanisms implemented in the MWL-PACS UI application.

## Overview

The MWL-PACS UI application supports three distinct data storage mechanisms:

1. **Browser Storage (Local)**
2. **Server Storage (Node.js Server)**
3. **External Backend API Storage**

Each mechanism serves different purposes and offers various advantages depending on the deployment scenario.

## 1. Browser Storage (Local)

### Description
Data is stored locally in the browser's `localStorage`. This is the default storage mode when no server is configured.

### Characteristics
- **Persistence**: Data persists between browser sessions but is specific to the browser and device
- **Accessibility**: Data is only accessible from the same browser on the same device
- **Performance**: Fast read/write operations with no network latency
- **Limitations**: Limited storage capacity (typically 5-10MB per domain)

### Use Cases
- Standalone offline usage
- Development and testing
- Temporary data storage

### Implementation
Data is stored using the `localStorage` API with JSON serialization:
```javascript
localStorage.setItem('entityName', JSON.stringify(data));
```

### Storage Locations
- Patient data
- Order data
- User preferences
- Configuration settings
- Company profile

## 2. Server Storage (Node.js Server)

### Description
Data is stored on a remote Node.js server with synchronization capabilities. This mode enables multi-device access and data persistence beyond a single browser.

### Characteristics
- **Persistence**: Data is stored on the server and persists across all devices
- **Accessibility**: Data is accessible from any device with network access to the server
- **Synchronization**: Automatic synchronization between client and server
- **Authentication**: Basic authentication support for secure access

### Use Cases
- Multi-device access
- Team collaboration
- Centralized data management
- Production deployments

### Implementation
The server uses file-based JSON storage with RESTful API endpoints:
```javascript
// Server-side storage
const filePath = path.join(DATA_DIR, 'entity.json');
fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
```

### API Endpoints
- `GET /api/:entity` - Retrieve all items for an entity
- `POST /api/:entity` - Create a new item
- `PUT /api/:entity/:id` - Update an item by ID
- `DELETE /api/:entity/:id` - Delete an item by ID
- `POST /api/sync` - Synchronize all data at once
- `GET /api/company-profile` - Retrieve company profile
- `POST /api/company-profile` - Save company profile

### Storage Locations
All application data is stored in JSON files in the `server-data` directory:
- `patients.json`
- `orders.json`
- `doctors.json`
- `nurses.json`
- `modalities.json`
- `dicomNodes.json`
- `users.json`
- `auditLogs.json`
- `settings.json`
- `company-profile.json`

## 3. External Backend API Storage

### Description
Data is retrieved from an external backend API. This mode allows integration with existing hospital information systems or PACS systems.

### Characteristics
- **Integration**: Seamless integration with external systems
- **Real-time**: Access to real-time data from backend systems
- **Fallback**: Automatic fallback to local data when backend is unavailable
- **Customization**: Support for custom backend implementations

### Use Cases
- Integration with hospital information systems (HIS)
- Integration with radiology information systems (RIS)
- Integration with picture archiving and communication systems (PACS)
- Enterprise deployments

### Implementation
The application uses the `fetch` API to communicate with external endpoints:
```javascript
const response = await fetch(`${apiBaseUrl}/api/${entity}`);
const data = await response.json();
```

### API Endpoints
Expected endpoints for external backend integration:
- `/api/dashboard` - Dashboard statistics
- `/api/patients` - Patient data
- `/api/orders` - Order data
- `/api/worklist` - Worklist data
- `/api/procedures` - Procedure data
- `/api/modalities` - Modality data
- `/api/dicom-nodes` - DICOM node data
- `/api/users` - User data
- `/api/audit-logs` - Audit log data
- `/api/ui-settings` - UI configuration settings

## Storage Configuration

The application allows users to configure the storage mode through the Settings page:

### Data Storage Mode Options
1. **Client Storage (Local)** - Uses browser localStorage
2. **Server Storage** - Uses remote Node.js server with synchronization

### Configuration Process
1. Navigate to the Settings page
2. Locate the "Data Storage Configuration" section
3. Choose between Client-side and Server-side storage
4. For Server-side storage, configure the server URL and authentication credentials
5. Use the "Sync Data to Server" button to synchronize existing local data

### Storage Priority Order
The application follows a specific priority order when loading data:
1. **External Backend API** - If enabled, data is loaded from the external API
2. **Server Storage** - If server storage is configured, data is loaded from the server
3. **Browser Storage** - As a fallback, data is loaded from localStorage
4. **Default Data** - If no other data is available, default mock data is used

## Data Synchronization

### Server Storage Synchronization
When using server storage mode, the application automatically synchronizes data between the client and server:

1. **Push to Server** - Local changes are pushed to the server
2. **Pull from Server** - Server changes are pulled to the client
3. **Conflict Resolution** - Last-write-wins conflict resolution strategy
4. **Offline Support** - Local storage acts as a buffer when offline

### External API Fallback
When using external API storage:
1. **Primary Source** - Data is loaded from the external API
2. **Fallback** - If the API is unavailable, data falls back to local storage
3. **Notification** - Users are notified when falling back to local data

## Security Considerations

### Authentication
- **Server Storage**: Basic authentication with username/password
- **External API**: Configurable authentication mechanisms

### Data Protection
- **Encryption**: Sensitive data should be encrypted in transit and at rest
- **Access Control**: Role-based access control for different user types
- **Audit Logging**: All data access and modifications are logged

## Best Practices

### Choosing the Right Storage Mode
1. **Development**: Use browser storage for quick prototyping and testing
2. **Single User**: Use server storage for persistent data with backup capabilities
3. **Multi-User**: Use external API storage for integration with existing systems
4. **Enterprise**: Use external API storage with proper authentication and authorization

### Data Management
1. **Regular Backups**: Implement regular backup procedures for server storage
2. **Data Validation**: Validate all data before storing
3. **Error Handling**: Implement proper error handling for all storage operations
4. **Monitoring**: Monitor storage usage and performance

## Conclusion

The MWL-PACS UI application provides flexible data storage options to accommodate different deployment scenarios and requirements. By understanding the characteristics and use cases of each storage mechanism, users can choose the most appropriate option for their specific needs.