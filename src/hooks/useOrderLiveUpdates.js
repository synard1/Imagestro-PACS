import { useState, useEffect, useRef } from 'react';
import orderEventBus from '../services/orderEventBus';

/**
 * Hook to consume live order updates.
 * Debounces updates to prevent excessive re-renders.
 */
export function useOrderLiveUpdates() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const timeoutRef = useRef(null);

  useEffect(() => {
    const handleOrderCreated = (newOrder) => {
      // Debounce updates by 300ms
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      
      timeoutRef.current = setTimeout(() => {
        setOrders(prev => [...prev, newOrder]);
      }, 300);
    };

    const unsubscribe = orderEventBus.subscribe('orderCreated', handleOrderCreated);

    return () => {
      unsubscribe();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return { orders, loading, error };
}
