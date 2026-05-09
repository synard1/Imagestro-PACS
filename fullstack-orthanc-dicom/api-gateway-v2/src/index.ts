import { Hono } from 'hono';

const app = new Hono();

// Health check endpoint
app.get('/health', (c) => {
  return c.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Example endpoint for master data (to be implemented)
app.get('/api/master-data', async (c) => {
  // In a real implementation, we would fetch from master-data-service
  // For now, return a placeholder
  return c.json({ message: 'Master data endpoint' });
});

// Example endpoint for order management
app.get('/api/orders', async (c) => {
  // In a real implementation, we would fetch from order-management-service
  return c.json({ message: 'Orders endpoint' });
});

// Add more endpoints as needed

export default app;