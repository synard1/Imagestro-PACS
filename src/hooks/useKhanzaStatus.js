import { useState, useEffect } from 'react';
import { 
  isKhanzaEnabled, 
  checkHealth, 
  setKhanzaEnabled, 
  saveKhanzaConfig 
} from '../services/khanzaService';
import { listExternalSystems, getExternalSystem } from '../services/externalSystemsService';
import { logger } from '../utils/logger';

export function useKhanzaStatus() {
  const [enabled, setEnabled] = useState(false);
  const [connected, setConnected] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let mounted = true;

    const checkStatus = async () => {
      try {
        // 1. Check External Systems module (Source of Truth)
        // We look for any active SIMRS system with provider 'Khanza'
        const extSystems = await listExternalSystems({ 
          type: 'SIMRS', 
          is_active: true 
        });
        
        const khanzaSystem = (extSystems.items || [])
          .find(sys => 
            (sys.provider === 'Khanza' || sys.code?.toLowerCase().includes('khanza')) && 
            sys.is_active
          );

        if (khanzaSystem) {
          // Found active Khanza in External Systems!
          
          // Fetch full details with unmasked credentials to allow API connection
          let sysDetails = khanzaSystem;
          try {
            sysDetails = await getExternalSystem(khanzaSystem.id, {
              includeCredentials: true
            });
          } catch (e) {
            console.warn('[useKhanzaStatus] Failed to fetch system details with credentials:', e);
          }

          if (mounted) {
            // Update registry config
            // Use values from detailed fetch if available (for unmasked keys)
            saveKhanzaConfig({
              baseUrl: sysDetails.base_url || khanzaSystem.base_url,
              apiKey: sysDetails.api_key, // This should now be unmasked
              timeoutMs: sysDetails.timeout_ms || 30000,
              healthPath: sysDetails.health_path || '/health',
            });
            
            // Ensure it's marked as enabled in registry
            setKhanzaEnabled(true);
            
            setEnabled(true);
          }

          // Check connectivity
          // We can try to use the system's status if available, or double check
          try {
            const health = await checkHealth({ notify: false });
            if (mounted) {
              setConnected(health.status === 'connected');
            }
          } catch (e) {
            console.warn('Khanza health check failed after sync:', e);
            if (mounted) setConnected(false);
          }
          
        } else {
          // Fallback: Check Legacy Registry directly
          const isRegistryEnabled = isKhanzaEnabled();
          
          if (mounted) {
            setEnabled(isRegistryEnabled);
            
            if (!isRegistryEnabled) {
              setConnected(false);
              return; // Done
            }
          }

          // If registry enabled, check health
          try {
            const health = await checkHealth({ notify: false });
            if (mounted) {
              setConnected(health.status === 'connected');
            }
          } catch (e) {
            if (mounted) setConnected(false);
          }
        }
      } catch (err) {
        logger.error('[useKhanzaStatus] Failed to check status', err);
        // Fallback to safe default
        if (mounted) {
           const legacyEnabled = isKhanzaEnabled();
           setEnabled(legacyEnabled);
           if(legacyEnabled) {
             try {
                const health = await checkHealth({ notify: false });
                setConnected(health.status === 'connected');
             } catch { setConnected(false); }
           } else {
             setConnected(false);
           }
        }
      } finally {
        if (mounted) {
          setChecking(false);
        }
      }
    };

    checkStatus();

    return () => {
      mounted = false;
    };
  }, []);

  return { enabled, connected, checking };
}
