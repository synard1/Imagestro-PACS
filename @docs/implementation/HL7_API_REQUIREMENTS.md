# HL7 Integration API Requirements

This document outlines the API endpoints and data structures required by the Frontend UI to support the HL7 Integration features (Dashboard, Monitoring, Configuration).

## 1. Overview
The frontend requires a set of RESTful endpoints to:
1.  Monitor the status of the MLLP Listener.
2.  View and search the HL7 message audit log.
3.  Configure the MLLP listener and remote destinations.

**Base URL:** `/api/hl7` (or as configured in `api-registry.js`)

## 2. Endpoints

### 2.1. System Status
**GET** `/api/hl7/status`

Returns the current health and performance metrics of the HL7 service.

**Response:**
```json
{
  "status": "UP",             // "UP", "DOWN", "DEGRADED"
  "uptime": "4d 12h 30m",     // Human readable uptime
  "listenerPort": 2575,       // Current active port
  "messagesToday": 145,       // Count of messages processed since 00:00
  "errorsToday": 2,           // Count of NACKs/Errors since 00:00
  "avgProcessingTimeMs": 45,  // Moving average of processing time
  "lastMessageAt": "2023-10-27T10:30:00Z"
}
```

### 2.2. Message Log
**GET** `/api/hl7/messages`

Retrieves a paginated list of HL7 messages.

**Query Parameters:**
*   `page`: Page number (default 1)
*   `limit`: Items per page (default 20)
*   `startDate`: ISO Date (optional)
*   `endDate`: ISO Date (optional)
*   `type`: Message type filter (e.g., "ORM", "ORU")
*   `status`: Status filter ("ACK", "NACK")
*   `search`: Text search (Control ID, Patient Name, Accession)

**Response:**
```json
{
  "data": [
    {
      "id": "uuid-123",
      "timestamp": "2023-10-27T10:30:00Z",
      "type": "ORM^O01",
      "controlId": "MSG10001",
      "sender": "HIS_APP",
      "receiver": "PACS_MWL",
      "status": "ACK",        // "ACK", "NACK", "PENDING"
      "rawContent": "MSH|^~\\&|...", // The full raw HL7 message
      "errorMessage": null    // Error details if status is NACK
    }
  ],
  "total": 145,
  "page": 1,
  "pageSize": 20
}
```

### 2.3. Configuration
**GET** `/api/config/hl7`
**PUT** `/api/config/hl7`

Manage the MLLP listener and routing configuration.

**Data Model:**
```json
{
  "enabled": true,
  "mllpPort": 2575,
  "encoding": "UTF-8",        // "UTF-8", "ASCII", "ISO-8859-1"
  "autoAck": true,            // Automatically send AA (Application Accept)
  "remoteDestinations": [     // Where to forward results (ORU)
    {
      "name": "Main HIS",
      "ip": "192.168.1.10",
      "port": 2575,
      "type": "ORU"
    }
  ]
}
```

### 2.4. Operations
**POST** `/api/hl7/messages/{id}/retry`

Manually re-process a message (useful for messages that failed due to temporary issues).

**Response:** `200 OK`

## 3. HL7 Parsing Requirements
The backend is expected to parse incoming HL7 messages to extract key metadata for the log (Patient Name, ID, Accession Number) to enable search functionality. The `rawContent` should always be preserved exactly as received.
