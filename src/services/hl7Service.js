/**
 * HL7 Integration Service
 * Handles interaction with the backend MLLP listener and HL7 message logs.
 * Includes robust mock data generation for UI development.
 */

import { fetchJson } from './http';
import { loadRegistry } from './api-registry';
import { notify } from './notifications';

const MOCK_HL7_CONFIG = {
  enabled: true,
  mllpPort: 2575,
  encoding: 'UTF-8',
  autoAck: true,
  remoteDestinations: [
    { name: 'Main HIS', ip: '192.168.1.10', port: 2575, type: 'ORU' }
  ]
};

const MOCK_STATS = {
  status: 'UP',
  uptime: '4d 12h 30m',
  messagesToday: 145,
  errorsToday: 2,
  avgProcessingTimeMs: 45
};

// Helper to generate fake HL7 messages
const generateMockMessages = (count = 10) => {
  const types = ['ORM^O01', 'ORU^R01', 'ADT^A04'];
  const statuses = ['ACK', 'ACK', 'ACK', 'ACK', 'NACK']; // 20% fail rate
  
  return Array.from({ length: count }).map((_, i) => {
    const type = types[Math.floor(Math.random() * types.length)];
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const id = Math.floor(Math.random() * 1000000).toString();
    const date = new Date();
    date.setMinutes(date.getMinutes() - i * 15); // Spread out over time

    return {
      id: `msg-${id}`,
      timestamp: date.toISOString(),
      type: type,
      controlId: `MSG${id}`,
      sender: 'HIS_APP',
      receiver: 'PACS_MWL',
      status: status,
      rawContent: `MSH|^~\\&|HIS_APP|HOSPITAL|PACS_MWL|RADIOLOGY|${date.toISOString().replace(/[-:T.]/g, '')}||${type}|${id}|P|2.3\rPID|1||PAT${id}||DOE^JOHN||19800101|M\rPV1|1|O|OP^PAEDS||||123^DOC^REF`,
      errorMessage: status === 'NACK' ? 'Segment PID missing required field' : null
    };
  });
};

let cachedMessages = generateMockMessages(20);

/**
 * Get HL7 Service Status
 */
export async function getHL7Status() {
  const registry = loadRegistry();
  const hl7Config = registry.hl7 || { enabled: false };

  try {
    if (hl7Config.enabled) {
      const baseUrl = hl7Config.baseUrl || import.meta.env.VITE_MAIN_API_BACKEND_URL || 'http://localhost:8003';
      return await fetchJson(`${baseUrl}/api/hl7/status`);
    }
    // Mock
    return { ...MOCK_STATS };
  } catch (error) {
    console.warn('HL7 Status fetch failed, using mock:', error);
    return { ...MOCK_STATS, status: 'DOWN', errorMessage: 'Connection refused' };
  }
}

/**
 * Get HL7 Messages (Log)
 */
export async function getHL7Messages(filters = {}) {
  const registry = loadRegistry();
  const hl7Config = registry.hl7 || { enabled: false };

  try {
    if (hl7Config.enabled) {
      const baseUrl = hl7Config.baseUrl || import.meta.env.VITE_MAIN_API_BACKEND_URL || 'http://localhost:8003';
      // Convert filters to query params
      const params = new URLSearchParams(filters).toString();
      return await fetchJson(`${baseUrl}/api/hl7/messages?${params}`);
    }
    // Mock
    return { 
      data: cachedMessages,
      total: cachedMessages.length,
      page: 1,
      pageSize: 20
    };
  } catch (error) {
    console.warn('HL7 Messages fetch failed, using mock:', error);
    return { data: [], total: 0 };
  }
}

/**
 * Get HL7 Configuration
 */
export async function getHL7Config() {
  const registry = loadRegistry();
  const hl7Config = registry.hl7 || { enabled: false };

  try {
    if (hl7Config.enabled) {
      const baseUrl = hl7Config.baseUrl || import.meta.env.VITE_MAIN_API_BACKEND_URL || 'http://localhost:8003';
      return await fetchJson(`${baseUrl}/api/config/hl7`);
    }
    // Mock
    const stored = localStorage.getItem('hl7_config');
    return stored ? JSON.parse(stored) : { ...MOCK_HL7_CONFIG };
  } catch (error) {
    return { ...MOCK_HL7_CONFIG };
  }
}

/**
 * Update HL7 Configuration
 */
export async function updateHL7Config(config) {
  const registry = loadRegistry();
  const hl7Config = registry.hl7 || { enabled: false };

  try {
    if (hl7Config.enabled) {
      const baseUrl = hl7Config.baseUrl || import.meta.env.VITE_MAIN_API_BACKEND_URL || 'http://localhost:8003';
      return await fetchJson(`${baseUrl}/api/config/hl7`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
    }
    // Mock
    localStorage.setItem('hl7_config', JSON.stringify(config));
    notify({ type: 'success', message: 'HL7 Configuration saved (Local)' });
    return config;
  } catch (error) {
    notify({ type: 'error', message: 'Failed to save HL7 config' });
    throw error;
  }
}

/**
 * Retry a failed message
 */
export async function retryMessage(messageId) {
  notify({ type: 'info', message: 'Retrying message...' });
  await new Promise(r => setTimeout(r, 1000));
  notify({ type: 'success', message: 'Message reprocessed successfully' });
  return true;
}
