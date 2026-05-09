const http = require('http');
const url = require('url');

const PORT = process.env.PORT || 8888;

// Simple mock server for testing
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  
  console.log(`[${new Date().toISOString()}] ${req.method} ${pathname}`);
  
  if (pathname === '/satusehat/encounter' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        console.log('[encounter] create payload', payload);
        
        // Extract patientId from FHIR Encounter structure
        let patientId = payload.patientId || '';
        
        // If patientId not found at root level, try to extract from subject.reference
        if (!patientId && payload.subject?.reference) {
          const subjectRef = String(payload.subject.reference);
          if (subjectRef.startsWith('Patient/')) {
            patientId = subjectRef.replace('Patient/', '');
          }
        }
        
        console.log('[encounter] extracted patientId:', patientId);
        
        if (!patientId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'patientId wajib' }));
          return;
        }
        
        // Mock successful response
        const mockResponse = {
          resourceType: 'Encounter',
          id: 'enc-' + Date.now(),
          status: payload.status || 'planned',
          class: payload.class || { code: 'AMB' },
          subject: payload.subject,
          identifier: payload.identifier || [],
          period: payload.period || { start: new Date().toISOString() }
        };
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(mockResponse));
        
      } catch (e) {
        console.error('[encounter] create error', e);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message || String(e) }));
      }
    });
    
    return;
  }
  
  // Default response for other endpoints
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`[satusehat-integrator] listening on :${PORT}`);
});