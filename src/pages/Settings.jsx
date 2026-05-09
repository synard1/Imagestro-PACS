// ...existing code...
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../services/api'
import { apiClient } from '../services/http'
import { getConfig, saveConfig } from '../services/config'
import {
  previewAccessionFromConfig,
  resetAllCounters
} from '../services/accession'
import {
  loadRegistry,
  saveRegistry,
  DEFAULT_REGISTRY,
  onRegistryChanged
} from '../services/api-registry'
import { useAuth } from '../hooks/useAuth'
import { useBackendHealth } from '../hooks/useBackend'
import { getDataStorageConfig, saveData, loadCompanyProfileFromServer } from '../services/dataSync'
import { updateSettings } from '../services/settingsService'
import MWLConfiguration from '../components/admin/MWLConfiguration'
import HL7Configuration from '../components/hl7/HL7Configuration'
import NotificationSettings from '../components/settings/NotificationSettings'
import PWASettings from '../components/settings/PWASettings'
import { setCurrentUser } from '../services/rbac'

// DEPRECATED: Old notification methods - kept for fallback only
// import { loadNotificationConfig, saveNotificationConfig, testTelegramNotification, testWhatsappNotification, simulateNotification } from '../services/notificationLogicService'


import StorageIndicator from '../components/StorageIndicator'
import BrandingSection from '../components/settings/BrandingSection'

export default function Settings() {
  const { t } = useTranslation()
  const { currentUser } = useAuth() || {}
  const isSuperUser = ['superadmin', 'developer'].includes((currentUser?.role || '').toLowerCase())

  const [cfg, setCfg] = useState(null)
  const [ui, setUi] = useState(null)

  useEffect(() => {
    // Load config asynchronously
    const loadConfig = async () => {
      const config = await getConfig();
      setUi(config);
    };
    loadConfig();
  }, [])

  // Company profile state
  const [companyProfile, setCompanyProfile] = useState({
    name: '',
    address: '',
    phone: '',
    email: '',
    website: '',
    logoUrl: ''
  })

  // State for logo preview
  const [logoPreview, setLogoPreview] = useState(null);
  const [logoError, setLogoError] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState('general')

  // Accession configuration state (initialized with safe defaults; loaded strictly from backend)
  const defaultAccession = {
    pattern: '{ORG}-{YYYY}{MM}{DD}-{SEQ4}',
    resetPolicy: 'daily',
    seqPadding: 4,
    orgCode: 'RS01',
    siteCode: 'RAD',
    useModalityInSeqScope: false,
    allowedSeparators: ['-', '_', '/']
  }
  const [accessionConfig, setAccessionConfig] = useState(defaultAccession)
  const [draftAccessionConfig, setDraftAccessionConfig] = useState(defaultAccession)
  const [previewModality, setPreviewModality] = useState('CT')
  const [accessionPermissionError, setAccessionPermissionError] = useState(false)

  // Order Number configuration state (similar to accession)
  const defaultOrderNumber = {
    pattern: 'ORD{YYYY}{MM}{DD}{SEQ5}',
    resetPolicy: 'daily',
    seqPadding: 5,
    orgCode: 'RS01',
    siteCode: 'RAD',
    useModalityInSeqScope: false,
    prefix: 'ORD',
    allowedSeparators: ['-', '_', '/']
  }
  const [orderNumberConfig, setOrderNumberConfig] = useState(defaultOrderNumber)
  const [draftOrderNumberConfig, setDraftOrderNumberConfig] = useState(defaultOrderNumber)
  const [orderNumberPermissionError, setOrderNumberPermissionError] = useState(false)

  // Backend modules configuration state (sourced from backend via settingsService; DEFAULT_REGISTRY as placeholder)
  const [registry, setRegistry] = useState({ ...DEFAULT_REGISTRY })
  const [draftRegistry, setDraftRegistry] = useState({ ...DEFAULT_REGISTRY })

  // Backend health monitoring - check every 10 minutes to reduce backend load
  const healthStatus = useBackendHealth({ intervalMs: 600000 }) // 10 minutes

  // Data storage mode configuration state
  const [dataStorageMode, setDataStorageMode] = useState(() => {
    return localStorage.getItem('dataStorageMode') || 'client'; // 'client' or 'server'
  });
  const [serverConfig, setServerConfig] = useState(() => {
    const saved = localStorage.getItem('serverDataConfig');
    // Handle case where saved might be the string "undefined"
    if (saved && saved !== 'undefined') {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse serverDataConfig:', e);
      }
    }
    return {
      serverUrl: 'http://localhost:3001',
      username: '',
      password: ''
    };
  });
  const [syncStatus, setSyncStatus] = useState('idle'); // 'idle', 'syncing', 'success', 'error'

  // SatuSehat configuration state
  const [satusehatConfig, setSatusehatConfig] = useState({
    environment: 'STAGING',
    clientId: '',
    clientSecret: '',
    organizationId: '',
    enabled: false
  });
  const [satusehatStatus, setSatusehatStatus] = useState(null);
  const [testingConnection, setTestingConnection] = useState(false);

  // SatuSehat mock data mode (superadmin/developer only)
  const [satusehatShowMockData, setSatusehatShowMockData] = useState(() => {
    const saved = localStorage.getItem('satusehat_show_mock_data');
    return saved === 'true';
  });

  // AI Assistant configuration state (superadmin/developer only)
  const [aiConfig, setAiConfig] = useState(() => {
    const saved = localStorage.getItem('ai_assistant_config');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse ai_assistant_config:', e);
      }
    }
    return {
      enabled: DEFAULT_REGISTRY.ai?.enabled ?? false,
      provider: 'google-gemini',
      model: 'gemini-1.5-pro',
      apiKey: '',
      maxTokens: 2048,
      temperature: 0.7,
      debug: false
    };
  });

  // PWA configuration state
  const [pwaConfig, setPwaConfig] = useState({
    enabled: true,
    offlineMode: true,
    cacheStrategy: 'intelligent', // 'intelligent', 'aggressive', 'minimal'
    updateNotifications: true,
    installPrompts: true,
    backgroundSync: true,
    pushNotifications: false
  });
  const [pwaStatus, setPwaStatus] = useState({
    isRegistered: false,
    isInstalled: false,
    hasUpdate: false,
    cacheSize: 0,
    lastUpdate: null
  });

  // DEPRECATED: Old notification state - replaced with NotificationSettings component
  // const [notificationConfig, setNotificationConfig] = useState({
  //   enabled: false,
  //   telegramBotToken: '',
  //   notifyOnNewOrder: true,
  //   notifyOnStagnantOrder: false,
  //   stagnantThresholdMinutes: 60
  // });

  // Load SatuSehat token from localStorage on component mount
  const [satusehatToken, setSatusehatToken] = useState(() => {
    const savedToken = localStorage.getItem('satusehat_token');
    const savedExpiry = localStorage.getItem('satusehat_token_expiry');

    if (savedToken && savedExpiry) {
      const expiryDate = new Date(parseInt(savedExpiry));
      // Check if token is still valid (not expired)
      if (expiryDate > new Date()) {
        return savedToken;
      } else {
        // Token expired, remove it
        localStorage.removeItem('satusehat_token');
        localStorage.removeItem('satusehat_token_expiry');
      }
    }
    return null;
  });

  // Load PWA configuration from localStorage
  useEffect(() => {
    const loadPWAConfig = async () => {
      try {
        const savedConfig = localStorage.getItem('pwa-config')
        if (savedConfig) {
          const parsedConfig = JSON.parse(savedConfig)
          setPwaConfig({ ...pwaConfig, ...parsedConfig })
        }
        
        // Load PWA status
        if ('serviceWorker' in navigator) {
          const registration = await navigator.serviceWorker.getRegistration()
          setPwaStatus({
            isRegistered: !!registration,
            isInstalled: window.matchMedia('(display-mode: standalone)').matches,
            hasUpdate: registration?.waiting !== null,
            cacheSize: 0, // Will be calculated in PWASettings component
            lastUpdate: registration ? new Date().toISOString() : null
          })
        }
      } catch (error) {
        console.error('Failed to load PWA config:', error)
      }
    }
    loadPWAConfig()
  }, [])

  const [tokenExpiry, setTokenExpiry] = useState(() => {
    const savedExpiry = localStorage.getItem('satusehat_token_expiry');
    if (savedExpiry) {
      const expiryDate = new Date(parseInt(savedExpiry));
      // Check if token is still valid (not expired)
      if (expiryDate > new Date()) {
        return expiryDate;
      } else {
        // Token expired, remove it
        localStorage.removeItem('satusehat_token');
        localStorage.removeItem('satusehat_token_expiry');
      }
    }
    return null;
  });

  // Integration sub-tab state
  const [activeIntegrationTab, setActiveIntegrationTab] = useState('dicom');

  useEffect(() => {
    api.getSettings().then(setCfg)

    // Load company profile (local/server fallback); backend will override in the next effect when enabled
    const savedProfile = localStorage.getItem('companyProfile');
    if (savedProfile) {
      try {
        setCompanyProfile(JSON.parse(savedProfile));
      } catch (e) {
        console.error('Failed to parse company profile:', e);
      }
    } else {
      const config = getDataStorageConfig();
      if (config.mode === 'server' && config.serverConfig) {
        loadCompanyProfileFromServer().then(profile => {
          if (profile) {
            setCompanyProfile(profile);
          }
        });
      }
    }
  }, [])

  // Load accession format strictly from backend (no local fallback)
  useEffect(() => {
    const loadAccessionFromBackend = async () => {
      try {
        const { getAccessionConfig } = await import('../services/settingsService');
        const acc = await getAccessionConfig();
        setAccessionConfig({ ...acc });
        setDraftAccessionConfig({ ...acc });
      } catch (e) {
        console.error('Failed to load accession format from backend:', e);
        alert('Gagal memuat Accession Format dari backend: ' + e.message);
      }
    };
    loadAccessionFromBackend();
  }, [])

  // Load order number format from backend
  useEffect(() => {
    const loadOrderNumberFromBackend = async () => {
      try {
        const { getOrderNumberConfig } = await import('../services/settingsService');
        const orderNum = await getOrderNumberConfig();
        setOrderNumberConfig({ ...orderNum });
        setDraftOrderNumberConfig({ ...orderNum });
      } catch (e) {
        console.error('Failed to load order number format from backend:', e);
        // Don't show alert on first load - use defaults silently
        console.warn('Using default order number configuration');
      }
    };
    loadOrderNumberFromBackend();
  }, [])

  // Load widget settings from backend
  useEffect(() => {
    const loadWidgetSettingsFromBackend = async () => {
      try {
        const { getSettings } = await import('../services/settingsService');
        const settings = await getSettings();
        if (settings) {
          // Update cfg with widget settings from backend
          setCfg(prev => ({
            ...prev,
            worklistWidget: settings.worklistWidget || prev?.worklistWidget,
            floatingWorklistWidget: settings.floatingWorklistWidget || prev?.floatingWorklistWidget
          }));
        }
      } catch (e) {
        console.warn('Failed to load widget settings from backend:', e);
        // Silently fail - use defaults from cfg
      }
    };
    loadWidgetSettingsFromBackend();
  }, [ui?.backendEnabled])

  // Load Company Profile and Integration Registry from backend API (same pattern as Accession)
  useEffect(() => {
    const loadBackendSettings = async () => {
      try {
        const svc = await import('../services/settingsService');

        // Load company profile from backend
        try {
          const profile = await svc.getCompanyProfile();
          if (profile) setCompanyProfile({ ...profile });
        } catch (e) {
          console.warn('Company profile not found on backend, consider seeding:', e?.message || e);
        }

        // Load integration registry from backend
        try {
          const reg = await svc.getIntegrationRegistry();
          if (reg) {
            setRegistry(reg);
            setDraftRegistry(reg);
          }
        } catch (e) {
          console.warn('Integration registry not found on backend, consider seeding:', e?.message || e);
        }
      } catch (err) {
        console.error('Failed loading backend-backed settings:', err);
      }
    };
    loadBackendSettings();
  }, [ui?.backendEnabled])

  // Listen for registry changes
  useEffect(() => {
    const unsubscribe = onRegistryChanged((newRegistry) => {
      setRegistry(newRegistry)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    // Check token validity on component mount
    const savedToken = localStorage.getItem('satusehat_token');
    const savedExpiry = localStorage.getItem('satusehat_token_expiry');

    if (savedToken && savedExpiry) {
      const expiryDate = new Date(parseInt(savedExpiry));
      // If token is expired, clear it
      if (expiryDate <= new Date()) {
        localStorage.removeItem('satusehat_token');
        localStorage.removeItem('satusehat_token_expiry');
        // Update state if needed
        if (satusehatToken) {
          setSatusehatToken(null);
          setTokenExpiry(null);
        }
      }
    }
  }, []);

  // DEPRECATED: Old notification config loading - replaced with NotificationSettings component
  // useEffect(() => {
  //   const loadConfig = async () => {
  //     try {
  //       const config = await loadNotificationConfig();
  //       setNotificationConfig(config);
  //     } catch (error) {
  //       console.error('Failed to load notification config:', error);
  //     }
  //   };
  //   loadConfig();
  // }, []);

  const onSave = () => {
    saveConfig(ui)
    // Force small confirmation via alert or toast-like minimal
    alert('Settings saved. Reload page to apply to all tabs.')
  }

  // Effect to handle logo preview
  useEffect(() => {
    if (companyProfile.logoUrl) {
      setLogoPreview(companyProfile.logoUrl);
      setLogoError(false);
    } else {
      setLogoPreview(null);
      setLogoError(true);
    }
  }, [companyProfile.logoUrl]);

  // Function to handle logo loading errors
  const handleLogoError = () => {
    setLogoError(true);
    setLogoPreview(null);
  };

  // Function to handle logo loading success
  const handleLogoLoad = () => {
    setLogoError(false);
  };

  // Save company profile
  const saveCompanyProfile = async () => {
    // Save to backend if enabled (same pattern as Accession)
    if (ui?.backendEnabled) {
      try {
        const { updateCompanyProfile } = await import('../services/settingsService');
        const saved = await updateCompanyProfile(companyProfile);
        setCompanyProfile({ ...saved });
        // Also keep a local backup copy
        localStorage.setItem('companyProfile', JSON.stringify(saved));
        alert('Company profile saved to backend.');
        return;
      } catch (e) {
        console.error('Failed to save company profile to backend:', e);
        alert('Gagal menyimpan Company Profile ke backend: ' + (e?.message || e));
        return;
      }
    }

    // Otherwise, save locally and optionally to local server (dataSync)
    localStorage.setItem('companyProfile', JSON.stringify(companyProfile));
    const config = getDataStorageConfig();
    if (config.mode === 'server' && config.serverConfig) {
      try {
        // Use proper settings endpoint with PUT method
        const response = await fetch(`${config.serverConfig.serverUrl}/settings/company_profile`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(config.serverConfig.username && {
              'Authorization': 'Basic ' + btoa(`${config.serverConfig.username}:${config.serverConfig.password}`)
            })
          },
          body: JSON.stringify({ value: companyProfile, description: 'Company profile information' })
        });
        if (response.ok) {
          alert('Company profile saved and synchronized with server.');
        } else {
          const errorText = await response.text();
          alert(`Company profile saved locally. Failed to synchronize with server.\nError: ${errorText}`);
        }
      } catch (error) {
        console.error('Failed to sync company profile to server:', error);
        alert('Company profile saved locally. Failed to synchronize with server.');
      }
    } else {
      alert('Company profile saved locally.');
    }
  }

  // Handler for server config changes
  const handleServerConfigChange = (field, value) => {
    setServerConfig(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Save all settings including data storage configuration
  const saveAllSettings = async () => {
    // Save regular settings
    saveConfig(ui)
    saveRegistry(draftRegistry)
    saveAccessionConfig(draftAccessionConfig)

    // Save company profile
    localStorage.setItem('companyProfile', JSON.stringify(companyProfile));

    // Save data storage mode configuration
    localStorage.setItem('dataStorageMode', dataStorageMode);
    localStorage.setItem('serverDataConfig', JSON.stringify(serverConfig));

    // If backend is enabled, save settings to backend API
    if (ui.backendEnabled) {
      try {
        // Import the settings service
        const { updateSettings, getSettings } = await import('../services/settingsService');

        // Get current settings and update all configs
        const currentSettings = await getSettings();
        const updatedSettings = {
          ...currentSettings,
          ...ui,
          accessionConfig: draftAccessionConfig,
          registry: draftRegistry
        };

        // Update settings using the proper service
        await updateSettings(updatedSettings);
      } catch (error) {
        console.error('Failed to save settings to backend:', error);
        alert('Settings saved locally. Failed to save to backend: ' + error.message);
        return; // Don't proceed to server sync if backend API save failed
      }
    }

    // If in server mode, also save settings to server
    const config = getDataStorageConfig();
    if (config.mode === 'server' && config.serverConfig) {
      try {
        // Save settings data to server as a special entity
        const settingsData = [{
          uiConfig: ui,
          registry: draftRegistry,
          accessionConfig: draftAccessionConfig,
          companyProfile: companyProfile,
          dataStorageMode: dataStorageMode,
          serverConfig: serverConfig
        }];

        const response = await fetch(`${config.serverConfig.serverUrl}/api/settings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(config.serverConfig.username && {
              'Authorization': 'Basic ' + btoa(`${config.serverConfig.username}:${config.serverConfig.password}`)
            })
          },
          body: JSON.stringify(settingsData)
        });

        if (response.ok) {
          alert('All settings saved and synchronized with server.');
        } else {
          const errorText = await response.text();
          alert(`Settings saved locally. Failed to synchronize with server.\nError: ${errorText}`);
        }
      } catch (error) {
        console.error('Failed to sync settings to server:', error);
        alert('Settings saved locally. Failed to synchronize with server.');
      }
    } else if (ui.backendEnabled) {
      alert('Settings saved to backend API.');
    } else {
      alert('Settings saved locally.');
    }
  }

  // Save data handling settings
  const saveDataHandlingSettings = () => {
    saveConfig(ui)
    alert('Data handling settings saved successfully!')
  }

  const onSaveRegistry = async () => {
    try {
      const { updateIntegrationRegistry } = await import('../services/settingsService');
      const saved = await updateIntegrationRegistry(draftRegistry);
      // Mirror to local registry for runtime usage across components
      saveRegistry(saved);
      setRegistry({ ...saved });
      alert('Integration settings saved to backend.');
    } catch (e) {
      console.error('Failed to save integration registry to backend:', e);
      alert('Gagal menyimpan Integration ke backend: ' + (e?.message || e));
    }
  }

  const onResetRegistry = () => {
    if (confirm('Reset all backend modules to default configuration?')) {
      setDraftRegistry({ ...DEFAULT_REGISTRY })
    }
  }

  const updateModuleConfig = (moduleName, field, value) => {
    setDraftRegistry(prev => ({
      ...prev,
      [moduleName]: {
        ...prev[moduleName],
        [field]: value
      }
    }))
  }

  const getHealthStatusIcon = (moduleName) => {
    const status = healthStatus[moduleName];

    // Special handling for satusehat module
    if (moduleName === 'satusehat') {
      // If satusehat is not enabled, show disabled status
      if (!draftRegistry.satusehat?.enabled) return '⚪'; // Disabled

      // If no status yet, show checking
      if (!status) return '🟡'; // Checking

      // Show status based on health check result
      if (status.healthy) return '🟢'; // Healthy
      if (status.error) return '🔴'; // Error
      return '🟡'; // Checking
    }

    if (!status) return '⚪'; // Unknown
    if (status.healthy) return '🟢'; // Healthy
    if (status.error) return '🔴'; // Error
    return '🟡'; // Checking
  }

  const getHealthStatusText = (moduleName) => {
    const status = healthStatus[moduleName];

    // Special handling for satusehat module
    if (moduleName === 'satusehat') {
      if (!draftRegistry.satusehat?.enabled) return 'Disabled';
      if (!status) return 'Checking...';
      if (status.healthy) return `Healthy (${status.responseTime}ms)`;
      if (status.error) return `Error: ${status.error}`;
      return 'Checking...';
    }

    if (!status) return 'Unknown';
    if (status.healthy) return `Healthy (${status.responseTime}ms)`;
    if (status.error) return `Error: ${status.error}`;
    return 'Checking...';
  }

  const onSaveAccessionConfig = async () => {
    try {
      const { updateAccessionConfig } = await import('../services/settingsService');
      const saved = await updateAccessionConfig(draftAccessionConfig);
      setAccessionConfig({ ...saved });
      setAccessionPermissionError(false);
      alert('Accession format saved successfully to backend!');
    } catch (error) {
      console.error('Failed to save accession format to backend:', error);
      if (error && (error.status === 403 || /Permission denied/i.test(error.message))) {
        setAccessionPermissionError(true);
      }
      alert('Gagal menyimpan Accession Format ke backend: ' + error.message);
    }
  }

  const onPreviewAccession = async () => {
    try {
      const preview = await previewAccessionFromConfig(draftAccessionConfig, {
        modality: previewModality,
        date: new Date()
      })
      alert(`Preview: ${preview}`)
    } catch (error) {
      alert(`Error: ${error.message}`)
    }
  }

  const onResetCounters = () => {
    if (confirm('Reset all sequence counters? This action cannot be undone.')) {
      resetAllCounters()
      alert('All sequence counters have been reset.')
    }
  }

  const onSaveOrderNumberConfig = async () => {
    try {
      const { updateOrderNumberConfig } = await import('../services/settingsService');
      const saved = await updateOrderNumberConfig(draftOrderNumberConfig);
      setOrderNumberConfig({ ...saved });
      setOrderNumberPermissionError(false);
      alert('Order number format saved successfully to backend!');
    } catch (error) {
      console.error('Failed to save order number format to backend:', error);
      if (error && (error.status === 403 || /Permission denied/i.test(error.message))) {
        setOrderNumberPermissionError(true);
      }
      alert('Gagal menyimpan Order Number Format ke backend: ' + error.message);
    }
  }

  const onPreviewOrderNumber = async () => {
    try {
      const preview = await previewAccessionFromConfig(draftOrderNumberConfig, {
        modality: previewModality,
        date: new Date()
      })
      alert(`Preview: ${preview}`)
    } catch (error) {
      alert(`Error: ${error.message}`)
    }
  }

  const insertOrderNumberPattern = (pattern) => {
    setDraftOrderNumberConfig(prev => ({
      ...prev,
      pattern: pattern
    }))
  }

  // Sync data to server
  const syncDataToServer = async () => {
    setSyncStatus('syncing');
    try {
      // Import the dataSync service
      const { getCurrentDataWithDefaults } = await import('../services/dataSync');

      // Get all data with fallback following the correct priority order
      const dataToSync = await getCurrentDataWithDefaults();

      // Add settings data to the sync payload
      const settingsData = {
        uiConfig: ui,
        registry: draftRegistry,
        accessionConfig: draftAccessionConfig,
        companyProfile: companyProfile,
        dataStorageMode: dataStorageMode,
        serverConfig: serverConfig
      };

      // Add settings as an array with one item (to match the server's expected format)
      dataToSync.settings = [settingsData];

      console.log('Syncing data to server:', dataToSync);

      const response = await fetch(`${serverConfig.serverUrl}/api/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(serverConfig.username && {
            'Authorization': 'Basic ' + btoa(`${serverConfig.username}:${serverConfig.password}`)
          })
        },
        body: JSON.stringify(dataToSync)
      });

      console.log('Sync response:', response.status);

      if (response.ok) {
        const result = await response.json();
        setSyncStatus('success');
        setTimeout(() => setSyncStatus('idle'), 3000);
        alert(`Data synchronized successfully!\n${result.message}`);
      } else {
        const errorText = await response.text();
        setSyncStatus('error');
        alert(`Failed to synchronize data.\nStatus: ${response.status}\nResponse: ${errorText}`);
      }
    } catch (error) {
      console.error('Sync error:', error);
      setSyncStatus('error');
      alert(`Sync failed: ${error.message}`);
    }
  };

  const insertPattern = (pattern) => {
    setDraftAccessionConfig(prev => ({
      ...prev,
      pattern: pattern
    }))
  }

  // Save PWA configuration
  const savePWAConfig = async () => {
    try {
      // Save to localStorage
      localStorage.setItem('pwa-config', JSON.stringify(pwaConfig))
      
      // Apply configuration to PWA manager
      const { default: pwaManager } = await import('../services/pwaManager')
      pwaManager.configure(pwaConfig)
      
      // Save to backend if enabled
      if (ui?.backendEnabled) {
        try {
          const { updateSettings, getSettings } = await import('../services/settingsService')
          const currentSettings = await getSettings()
          const updatedSettings = {
            ...currentSettings,
            pwaConfig: pwaConfig
          }
          await updateSettings(updatedSettings)
          alert('PWA settings saved to backend successfully!')
        } catch (error) {
          console.error('Failed to save PWA settings to backend:', error)
          alert('PWA settings saved locally. Failed to save to backend: ' + error.message)
        }
      } else {
        alert('PWA settings saved successfully!')
      }
    } catch (error) {
      console.error('Failed to save PWA config:', error)
      alert('Failed to save PWA settings: ' + error.message)
    }
  }

  if (!cfg) return <div>Loading…</div>

  const tabs = isSuperUser ? [
    { id: 'general', label: t('General'), icon: '⚙️' },
    { id: 'modules', label: t('Backend Modules'), icon: '🔌' },
    { id: 'numbering', label: t('Numbering Formats'), icon: '🔢' },
    { id: 'widgets', label: t('Widgets'), icon: '📊' },
    { id: 'integration', label: t('Integration'), icon: '🔗' },
    { id: 'notifications', label: t('Notifications'), icon: '🔔' },
    { id: 'pwa', label: t('PWA Settings'), icon: '📱' }
  ] : [
    { id: 'general', label: t('General'), icon: '⚙️' },
    { id: 'numbering', label: t('Numbering Formats'), icon: '🔢' }
  ];

  // Integration sub-tabs - Only for superadmin/developer
  const integrationTabs = isSuperUser ? [
    { id: 'dicom', label: 'DICOM Router', icon: '📡' },
    { id: 'mwl', label: 'MWL SCP', icon: '📋' },
    { id: 'hl7', label: 'HL7 Integration', icon: '🏥' },
    { id: 'satusehat', label: 'SatuSehat', icon: '🇮🇩' },
    { id: 'ai', label: 'AI Assistant', icon: '🤖' },
    { id: 'thirdparty', label: 'Third Party', icon: '🌐' }
  ] : []

  // Get current storage configuration
  const storageConfig = getDataStorageConfig();
  const backendEnabled = ui?.backendEnabled;

  if (!cfg || !ui) return <div>Loading…</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">{t('Settings')}</h1>
        <div className="flex gap-2">
          {backendEnabled && <StorageIndicator storageType="external" />}
          {storageConfig.mode === 'server' && <StorageIndicator storageType="server" />}
          {storageConfig.mode === 'client' && <StorageIndicator storageType="browser" />}
        </div>
      </div>

      {/* Tab Navigation - Desktop (Horizontal Tabs) */}
      <div className="hidden md:flex border-b border-gray-200">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              px-6 py-3 text-sm font-medium transition-colors relative
              ${activeTab === tab.id
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900 hover:border-gray-300'
              }
            `}
          >
            <span className="mr-2">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Navigation - Mobile (Select Dropdown) */}
      <div className="md:hidden">
        <select
          value={activeTab}
          onChange={(e) => setActiveTab(e.target.value)}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {tabs.map(tab => (
            <option key={tab.id} value={tab.id}>
              {tab.icon} {tab.label}
            </option>
          ))}
        </select>
      </div>

      {/* Tab Content */}
      {activeTab === 'general' && (
        <div className="space-y-6">
          {/* Branding Section - Superadmin Only */}
          {isSuperUser && <BrandingSection />}

          {/* Quick Links Section */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Quick Links</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Report Settings Card */}
              <a
                href="/settings/reports"
                className="block p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:shadow-md transition-all group"
              >
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                      <span className="text-2xl">📄</span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                      Report Settings
                    </h3>
                    <p className="text-xs text-gray-600 mt-1">
                      Configure report header, footer, and PDF export settings
                    </p>
                  </div>
                </div>
              </a>

              {/* Data Management Card - Only visible to superadmin */}
              {isSuperUser && (
                <a
                  href="/data-management"
                  className="block p-4 border border-gray-200 rounded-lg hover:border-green-500 hover:shadow-md transition-all group"
                >
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0">
                      <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center group-hover:bg-green-200 transition-colors">
                        <span className="text-2xl">📊</span>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-gray-900 group-hover:text-green-600 transition-colors">
                        Data Management
                      </h3>
                      <p className="text-xs text-gray-600 mt-1">
                        Export master data tables (Doctors, Modalities, etc.) to Excel
                      </p>
                    </div>
                  </div>
                </a>
              )}

              {/* Theme Settings Card - Only visible to superadmin */}
              {isSuperUser && (
                <a
                  href="/theme-settings"
                  className="block p-4 border border-gray-200 rounded-lg hover:border-purple-500 hover:shadow-md transition-all group"
                >
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0">
                      <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center group-hover:bg-purple-200 transition-colors">
                        <span className="text-2xl">🎨</span>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-gray-900 group-hover:text-purple-600 transition-colors">
                        Theme Settings
                      </h3>
                      <p className="text-xs text-gray-600 mt-1">
                        Customize application appearance with different themes
                      </p>
                    </div>
                  </div>
                </a>
              )}

              {/* Placeholder for future settings */}
              <div className="p-4 border border-gray-200 rounded-lg opacity-50 cursor-not-allowed hidden">
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                      <span className="text-2xl">🔐</span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900">
                      Security Settings
                    </h3>
                    <p className="text-xs text-gray-600 mt-1">
                      Coming soon
                    </p>
                  </div>
                </div>
              </div>

              {/* <div className="p-4 border border-gray-200 rounded-lg opacity-50 cursor-not-allowed">
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                      <span className="text-2xl">🔔</span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900">
                      Notifications
                    </h3>
                    <p className="text-xs text-gray-600 mt-1">
                      Coming soon
                    </p>
                  </div>
                </div>
              </div> */}
            </div>
          </div>

          {/* Company Profile Section */}
          <div className="card">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Company Profile</h2>
              <StorageIndicator storageType={storageConfig.mode === 'server' ? 'server' : 'browser'} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Company Name</label>
                <input
                  type="text"
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={companyProfile.name}
                  onChange={e => setCompanyProfile(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter company name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Phone</label>
                <input
                  type="text"
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={companyProfile.phone}
                  onChange={e => setCompanyProfile(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="Enter phone number"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input
                  type="email"
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={companyProfile.email}
                  onChange={e => setCompanyProfile(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="Enter email address"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Website</label>
                <input
                  type="text"
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={companyProfile.website}
                  onChange={e => setCompanyProfile(prev => ({ ...prev, website: e.target.value }))}
                  placeholder="https://example.com"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-1">Address</label>
                <textarea
                  className="w-full border rounded px-3 py-2 text-sm"
                  rows="3"
                  value={companyProfile.address}
                  onChange={e => setCompanyProfile(prev => ({ ...prev, address: e.target.value }))}
                  placeholder="Enter company address"
                ></textarea>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-1">Logo URL</label>
                <input
                  type="text"
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={companyProfile.logoUrl}
                  onChange={e => setCompanyProfile(prev => ({ ...prev, logoUrl: e.target.value }))}
                  placeholder="https://example.com/logo.png"
                />
                <div className="mt-2">
                  <div className="text-xs text-gray-500 mb-1">Logo Preview:</div>
                  <div className="flex items-center justify-center w-32 h-32 border border-gray-300 rounded-lg bg-gray-50 overflow-hidden">
                    {logoError || !logoPreview ? (
                      <div className="text-center p-2">
                        <div className="text-4xl mb-1">🏢</div>
                        <div className="text-xs text-gray-500">No Logo</div>
                      </div>
                    ) : (
                      <img
                        src={logoPreview}
                        alt="Company Logo"
                        className="w-full h-full object-contain"
                        onError={handleLogoError}
                        onLoad={handleLogoLoad}
                      />
                    )}
                  </div>
                  {(logoError || !logoPreview) && companyProfile.logoUrl && (
                    <div className="text-xs text-red-500 mt-1">Logo not accessible. Showing placeholder.</div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button
                type="button"
                className="px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                onClick={saveCompanyProfile}
              >
                Save Company Profile
              </button>
            </div>
          </div>

          {/* <div className="card">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-lg font-semibold">Backend API</h2>
              <StorageIndicator storageType="external" />
            </div>
            <div className="flex flex-col gap-3 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox"
                  checked={ui.backendEnabled}
                  onChange={e=>setUi(prev => ({...prev, backendEnabled: e.target.checked}))}
                />
                <span>Enable backend data source</span>
              </label>
              <label className="grid grid-cols-1 md:grid-cols-3 gap-2 items-center">
                <span>Base URL</span>
                <input className="border rounded px-3 py-2 col-span-2"
                  value={ui.apiBaseUrl}
                  onChange={e=>setUi(prev => ({...prev, apiBaseUrl: e.target.value}))}
                  placeholder="http://localhost:8000"
                />
              </label>
              <label className="grid grid-cols-1 md:grid-cols-3 gap-2 items-center">
                <span>Timeout (ms)</span>
                <input className="border rounded px-3 py-2 col-span-2" type="number"
                  value={ui.timeoutMs}
                  onChange={e=>setUi(prev => ({...prev, timeoutMs: Number(e.target.value||0)}))}
                  min={1000}
                />
              </label>
              <div>
                <button onClick={onSave} className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm">Save</button>
              </div>
              <p className="text-xs text-slate-500">
                Saat backend diaktifkan, UI akan mencoba memuat dari endpoint di atas.
                Jika backend tidak bisa diakses, akan muncul notifikasi dan UI jatuh ke data dummy agar tetap bisa dipakai.
              </p>
            </div>
          </div> */}

          {/* <div className="card">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Data Storage Configuration</h2>
              <StorageIndicator storageType={storageConfig.mode === 'server' ? 'server' : 'browser'} />
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Storage Mode</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2">
                    <input 
                      type="radio"
                      name="dataStorageMode"
                      value="client"
                      checked={dataStorageMode === 'client'}
                      onChange={e => setDataStorageMode(e.target.value)}
                    />
                    <span>Client Storage (Local)</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input 
                      type="radio"
                      name="dataStorageMode"
                      value="server"
                      checked={dataStorageMode === 'server'}
                      onChange={e => setDataStorageMode(e.target.value)}
                    />
                    <span>Server Storage</span>
                  </label>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Client storage uses browser localStorage. Server storage synchronizes data with a backend server.
                </p>
              </div>

              {dataStorageMode === 'server' && (
                <div className="border rounded-lg p-4 bg-gray-50 space-y-4">
                  <h3 className="text-md font-medium">Server Configuration</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Server URL</label>
                      <input 
                        type="text"
                        className="w-full border rounded px-3 py-2 text-sm"
                        value={serverConfig.serverUrl}
                        onChange={e => handleServerConfigChange('serverUrl', e.target.value)}
                        placeholder="http://localhost:3001"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium mb-1">Username</label>
                      <input 
                        type="text"
                        className="w-full border rounded px-3 py-2 text-sm"
                        value={serverConfig.username}
                        onChange={e => handleServerConfigChange('username', e.target.value)}
                        placeholder="admin"
                      />
                    </div>
                    
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium mb-1">Password</label>
                      <input 
                        type="password"
                        className="w-full border rounded px-3 py-2 text-sm"
                        value={serverConfig.password}
                        onChange={e => handleServerConfigChange('password', e.target.value)}
                        placeholder="Enter password"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button 
                      type="button"
                      className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                      onClick={async () => {
                        try {
                          const response = await fetch(`${serverConfig.serverUrl}/api/health`, {
                            method: 'GET',
                            headers: {
                              'Authorization': `Basic ${btoa(`${serverConfig.username}:${serverConfig.password}`)}`
                            }
                          });
                          
                          if (response.ok) {
                            alert('Connection successful!');
                          } else {
                            alert('Connection failed: ' + response.statusText);
                          }
                        } catch (error) {
                          alert('Connection failed: ' + error.message);
                        }
                      }}
                    >
                      Test Connection
                    </button>
                    
                    <button 
                      type="button"
                      className="px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                      onClick={syncDataToServer}
                      disabled={syncStatus === 'syncing'}
                    >
                      {syncStatus === 'syncing' ? 'Syncing...' : 'Sync to Server'}
                    </button>
                  </div>

                  {syncStatus && (
                    <div className={`text-sm p-2 rounded ${
                      syncStatus === 'success' ? 'bg-green-100 text-green-700' :
                      syncStatus === 'error' ? 'bg-red-100 text-red-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {syncStatus === 'success' && 'Data synchronized successfully!'}
                      {syncStatus === 'error' && 'Failed to sync data to server.'}
                      {syncStatus === 'syncing' && 'Synchronizing data...'}
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2 pt-4 border-t">
                <button
                  type="button"
                  className="px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                  onClick={saveAllSettings}
                >
                  Save Storage Settings
                </button>
              </div>
            </div>
          </div> */}
        </div>
      )}

      {/* Backend Modules Tab */}
      {activeTab === 'modules' && (
        <div className="space-y-6">
          <div className="card">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Backend Modules Configuration</h2>
              <StorageIndicator storageType="external" />
            </div>

            <div className="space-y-6">
              {Object.entries(draftRegistry).map(([moduleName, moduleConfig]) => (
                <div key={moduleName} className="border rounded-lg p-4 bg-gray-50">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-md font-medium capitalize flex items-center gap-2">
                      {moduleName}
                      <span className="text-lg" title={getHealthStatusText(moduleName)}>
                        {getHealthStatusIcon(moduleName)}
                      </span>
                    </h3>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={moduleConfig.enabled}
                        onChange={e => updateModuleConfig(moduleName, 'enabled', e.target.checked)}
                      />
                      <span className="text-sm">Enabled</span>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Base URL</label>
                      <input
                        type="text"
                        className="w-full border rounded px-3 py-2 text-sm"
                        value={moduleConfig.baseUrl}
                        onChange={e => updateModuleConfig(moduleName, 'baseUrl', e.target.value)}
                        placeholder="http://localhost:8000"
                        disabled={!moduleConfig.enabled}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">Health Path</label>
                      <input
                        type="text"
                        className="w-full border rounded px-3 py-2 text-sm"
                        value={moduleConfig.healthPath}
                        onChange={e => updateModuleConfig(moduleName, 'healthPath', e.target.value)}
                        placeholder="/health"
                        disabled={!moduleConfig.enabled}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">Timeout (ms)</label>
                      <input
                        type="number"
                        className="w-full border rounded px-3 py-2 text-sm"
                        value={moduleConfig.timeoutMs}
                        onChange={e => updateModuleConfig(moduleName, 'timeoutMs', parseInt(e.target.value) || 6000)}
                        min="1000"
                        disabled={!moduleConfig.enabled}
                      />
                    </div>

                    {moduleName === 'auth' && (
                      <div>
                        <label className="block text-sm font-medium mb-1">Login Path</label>
                        <input
                          type="text"
                          className="w-full border rounded px-3 py-2 text-sm"
                          value={moduleConfig.loginPath || '/login'}
                          onChange={e => updateModuleConfig(moduleName, 'loginPath', e.target.value)}
                          placeholder="/login"
                          disabled={!moduleConfig.enabled}
                        />
                      </div>
                    )}
                  </div>

                  {moduleConfig.enabled && (
                    <div className="mt-3 p-2 bg-white rounded border text-xs">
                      <div className="font-medium text-gray-600">Health Status:</div>
                      <div className="text-gray-500">{getHealthStatusText(moduleName)}</div>
                    </div>
                  )}
                </div>
              ))}

              <div className="flex gap-2 pt-4 border-t">
                <button
                  type="button"
                  className="px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                  onClick={onSaveRegistry}
                >
                  Save Modules Configuration
                </button>
                <button
                  type="button"
                  className="px-4 py-2 bg-gray-600 text-white text-sm rounded hover:bg-gray-700"
                  onClick={onResetRegistry}
                >
                  Reset to Default
                </button>
              </div>

              <div className="text-xs text-gray-500 bg-blue-50 p-3 rounded">
                <p><strong>Module Information:</strong></p>
                <ul className="mt-1 space-y-1">
                  <li><strong>Dashboard:</strong> Main dashboard data and statistics</li>
                  <li><strong>Auth:</strong> User authentication and authorization</li>
                  <li><strong>Worklist:</strong> DICOM worklist management</li>
                  <li><strong>Users:</strong> User management and profiles</li>
                  <li><strong>Orders:</strong> Order management system</li>
                  <li><strong>Reports:</strong> Report generation and management</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Numbering Formats Tab */}
      {activeTab === 'numbering' && (
        <div className="space-y-6">
          {/* Accession Number Format Card */}
          <div className="card">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">📋 Accession Number Format</h2>
              <StorageIndicator storageType={'external'} />
            </div>

            {accessionPermissionError && (
              <div className="mb-4 p-3 rounded border border-yellow-300 bg-yellow-50 text-sm text-yellow-800">
                Missing permission <span className="font-mono">setting:write</span>. Changes cannot be saved. Please contact an administrator or sign in with a role that includes <span className="font-mono">setting:write</span>.
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Configuration Form */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Pattern</label>
                  <input
                    type="text"
                    className="w-full border rounded px-3 py-2 font-mono text-sm"
                    value={draftAccessionConfig.pattern}
                    onChange={e => setDraftAccessionConfig(prev => ({
                      ...prev,
                      pattern: e.target.value
                    }))}
                    placeholder="{ORG}-{YYYY}{MM}{DD}-{SEQ4}"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Available tokens: {'{YYYY}'}, {'{YY}'}, {'{MM}'}, {'{DD}'}, {'{DOY}'}, {'{HOUR}'}, {'{MIN}'}, {'{SEC}'}, {'{MOD}'}, {'{ORG}'}, {'{SITE}'}, {'{SEQn}'}, {'{RANDn}'}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Reset Policy</label>
                    <select
                      className="w-full border rounded px-3 py-2 text-sm"
                      value={draftAccessionConfig.resetPolicy}
                      onChange={e => setDraftAccessionConfig(prev => ({
                        ...prev,
                        resetPolicy: e.target.value
                      }))}
                    >
                      <option value="daily">Daily</option>
                      <option value="monthly">Monthly</option>
                      <option value="never">Never</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Default Sequence Padding</label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      className="w-full border rounded px-3 py-2 text-sm"
                      value={draftAccessionConfig.seqPadding}
                      onChange={e => setDraftAccessionConfig(prev => ({
                        ...prev,
                        seqPadding: parseInt(e.target.value) || 4
                      }))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">ORG Code</label>
                    <input
                      type="text"
                      className="w-full border rounded px-3 py-2 text-sm"
                      value={draftAccessionConfig.orgCode}
                      onChange={e => setDraftAccessionConfig(prev => ({
                        ...prev,
                        orgCode: e.target.value
                      }))}
                      placeholder="RS01"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">SITE Code</label>
                    <input
                      type="text"
                      className="w-full border rounded px-3 py-2 text-sm"
                      value={draftAccessionConfig.siteCode}
                      onChange={e => setDraftAccessionConfig(prev => ({
                        ...prev,
                        siteCode: e.target.value
                      }))}
                      placeholder="RAD"
                    />
                  </div>
                </div>

                <div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draftAccessionConfig.useModalityInSeqScope}
                      onChange={e => setDraftAccessionConfig(prev => ({
                        ...prev,
                        useModalityInSeqScope: e.target.checked
                      }))}
                    />
                    <span>Modality-based sequence counter</span>
                  </label>
                  <p className="text-xs text-gray-500 mt-1">
                    If enabled, each modality will have its own sequence counter
                  </p>
                </div>

                {/* Predefined Patterns */}
                <div>
                  <label className="block text-sm font-medium mb-2">Quick Patterns</label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
                      onClick={() => insertPattern('{ORG}-{YYYY}{MM}{DD}-{SEQ4}')}
                    >
                      Daily
                    </button>
                    <button
                      type="button"
                      className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
                      onClick={() => insertPattern('{ORG}{YY}{MM}-{SEQ5}')}
                    >
                      Monthly
                    </button>
                    <button
                      type="button"
                      className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
                      onClick={() => insertPattern('{SITE}-{MOD}-{YYYY}{DOY}-{SEQ3}')}
                    >
                      With Modality
                    </button>
                    <button
                      type="button"
                      className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
                      onClick={() => insertPattern('{ORG}{YYYY}{MM}{DD}{HOUR}{MIN}{SEC}')}
                    >
                      Timestamp
                    </button>
                  </div>
                </div>

                {/* Preview Section */}
                <div className="border-t pt-4">
                  <label className="block text-sm font-medium mb-2">Preview</label>
                  <div className="flex gap-2 mb-2">
                    <select
                      className="border rounded px-3 py-2 text-sm"
                      value={previewModality}
                      onChange={e => setPreviewModality(e.target.value)}
                    >
                      {/* Using modalities from config instead of hardcoded values */}
                      {ui.modalities.map(modality => (
                        <option key={modality} value={modality}>{modality}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                      onClick={onPreviewAccession}
                    >
                      Preview
                    </button>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 pt-4 border-t">
                  <button
                    type="button"
                    className="px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                    onClick={onSaveAccessionConfig}
                  >
                    Save Accession Format
                  </button>
                  <button
                    type="button"
                    className="px-4 py-2 bg-red-600 text-white text-sm rounded hover:bg-red-700"
                    onClick={onResetCounters}
                  >
                    Reset Counters
                  </button>
                </div>
              </div>

              {/* Current vs Draft Comparison */}
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium mb-2">Current Active Pattern</h3>
                  <div className="bg-gray-50 p-3 rounded border">
                    <div className="font-mono text-sm">{accessionConfig.pattern}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      Reset: {accessionConfig.resetPolicy} | Padding: {accessionConfig.seqPadding}
                    </div>
                    <div className="text-xs text-gray-500">
                      ORG: {accessionConfig.orgCode} | SITE: {accessionConfig.siteCode}
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium mb-2">Draft Pattern</h3>
                  <div className="bg-blue-50 p-3 rounded border border-blue-200">
                    <div className="font-mono text-sm">{draftAccessionConfig.pattern}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      Reset: {draftAccessionConfig.resetPolicy} | Padding: {draftAccessionConfig.seqPadding}
                    </div>
                    <div className="text-xs text-gray-500">
                      ORG: {draftAccessionConfig.orgCode} | SITE: {draftAccessionConfig.siteCode}
                    </div>
                  </div>
                </div>

                <div className="text-xs text-gray-500">
                  <p><strong>Token Reference:</strong></p>
                  <ul className="mt-1 space-y-1">
                    <li><code>{'{YYYY}'}</code> - 4-digit year</li>
                    <li><code>{'{YY}'}</code> - 2-digit year</li>
                    <li><code>{'{MM}'}</code> - Month (01-12)</li>
                    <li><code>{'{DD}'}</code> - Day (01-31)</li>
                    <li><code>{'{DOY}'}</code> - Day of year (001-366)</li>
                    <li><code>{'{MOD}'}</code> - Modality code</li>
                    <li><code>{'{ORG}'}</code> - Organization code</li>
                    <li><code>{'{SITE}'}</code> - Site code</li>
                    <li><code>{'{SEQn}'}</code> - Sequence number (n=padding)</li>
                    <li><code>{'{RANDn}'}</code> - Random digits (n=length)</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Order Number Format Card */}
          <div className="card">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">🔢 Order Number Format</h2>
              <StorageIndicator storageType={'external'} />
            </div>

            {orderNumberPermissionError && (
              <div className="mb-4 p-3 rounded border border-yellow-300 bg-yellow-50 text-sm text-yellow-800">
                Missing permission <span className="font-mono">setting:write</span>. Changes cannot be saved. Please contact an administrator or sign in with a role that includes <span className="font-mono">setting:write</span>.
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Configuration Form */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Pattern</label>
                  <input
                    type="text"
                    className="w-full border rounded px-3 py-2 font-mono text-sm"
                    value={draftOrderNumberConfig.pattern}
                    onChange={e => setDraftOrderNumberConfig(prev => ({
                      ...prev,
                      pattern: e.target.value
                    }))}
                    placeholder="ORD{YYYY}{MM}{DD}{SEQ5}"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Available tokens: {'{YYYY}'}, {'{YY}'}, {'{MM}'}, {'{DD}'}, {'{DOY}'}, {'{HOUR}'}, {'{MIN}'}, {'{SEC}'}, {'{MOD}'}, {'{ORG}'}, {'{SITE}'}, {'{SEQn}'}, {'{RANDn}'}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Reset Policy</label>
                    <select
                      className="w-full border rounded px-3 py-2 text-sm"
                      value={draftOrderNumberConfig.resetPolicy}
                      onChange={e => setDraftOrderNumberConfig(prev => ({
                        ...prev,
                        resetPolicy: e.target.value
                      }))}
                    >
                      <option value="daily">Daily</option>
                      <option value="monthly">Monthly</option>
                      <option value="never">Never</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Default Sequence Padding</label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      className="w-full border rounded px-3 py-2 text-sm"
                      value={draftOrderNumberConfig.seqPadding}
                      onChange={e => setDraftOrderNumberConfig(prev => ({
                        ...prev,
                        seqPadding: parseInt(e.target.value) || 5
                      }))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Prefix</label>
                    <input
                      type="text"
                      className="w-full border rounded px-3 py-2 text-sm"
                      value={draftOrderNumberConfig.prefix || ''}
                      onChange={e => setDraftOrderNumberConfig(prev => ({
                        ...prev,
                        prefix: e.target.value
                      }))}
                      placeholder="ORD"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">ORG Code</label>
                    <input
                      type="text"
                      className="w-full border rounded px-3 py-2 text-sm"
                      value={draftOrderNumberConfig.orgCode}
                      onChange={e => setDraftOrderNumberConfig(prev => ({
                        ...prev,
                        orgCode: e.target.value
                      }))}
                      placeholder="RS01"
                    />
                  </div>
                </div>

                <div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draftOrderNumberConfig.useModalityInSeqScope}
                      onChange={e => setDraftOrderNumberConfig(prev => ({
                        ...prev,
                        useModalityInSeqScope: e.target.checked
                      }))}
                    />
                    <span>Modality-based sequence counter</span>
                  </label>
                  <p className="text-xs text-gray-500 mt-1">
                    If enabled, each modality will have its own sequence counter
                  </p>
                </div>

                {/* Predefined Patterns */}
                <div>
                  <label className="block text-sm font-medium mb-2">Quick Patterns</label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
                      onClick={() => insertOrderNumberPattern('ORD{YYYY}{MM}{DD}{SEQ5}')}
                    >
                      Daily (ORD)
                    </button>
                    <button
                      type="button"
                      className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
                      onClick={() => insertOrderNumberPattern('{ORG}-ORD-{YYYY}{MM}-{SEQ4}')}
                    >
                      Monthly
                    </button>
                    <button
                      type="button"
                      className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
                      onClick={() => insertOrderNumberPattern('ORD-{MOD}-{YYYY}{DOY}-{SEQ4}')}
                    >
                      With Modality
                    </button>
                    <button
                      type="button"
                      className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
                      onClick={() => insertOrderNumberPattern('ORD{YYYY}{MM}{DD}{HOUR}{MIN}{SEC}')}
                    >
                      Timestamp
                    </button>
                  </div>
                </div>

                {/* Preview Section */}
                <div className="border-t pt-4">
                  <label className="block text-sm font-medium mb-2">Preview</label>
                  <div className="flex gap-2 mb-2">
                    <select
                      className="border rounded px-3 py-2 text-sm"
                      value={previewModality}
                      onChange={e => setPreviewModality(e.target.value)}
                    >
                      {ui.modalities.map(modality => (
                        <option key={modality} value={modality}>{modality}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                      onClick={onPreviewOrderNumber}
                    >
                      Preview
                    </button>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 pt-4 border-t">
                  <button
                    type="button"
                    className="px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                    onClick={onSaveOrderNumberConfig}
                  >
                    Save Order Number Format
                  </button>
                </div>
              </div>

              {/* Current vs Draft Comparison */}
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium mb-2">Current Active Pattern</h3>
                  <div className="bg-gray-50 p-3 rounded border">
                    <div className="font-mono text-sm">{orderNumberConfig.pattern}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      Reset: {orderNumberConfig.resetPolicy} | Padding: {orderNumberConfig.seqPadding}
                    </div>
                    <div className="text-xs text-gray-500">
                      Prefix: {orderNumberConfig.prefix || 'N/A'} | ORG: {orderNumberConfig.orgCode}
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium mb-2">Draft Pattern</h3>
                  <div className="bg-blue-50 p-3 rounded border border-blue-200">
                    <div className="font-mono text-sm">{draftOrderNumberConfig.pattern}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      Reset: {draftOrderNumberConfig.resetPolicy} | Padding: {draftOrderNumberConfig.seqPadding}
                    </div>
                    <div className="text-xs text-gray-500">
                      Prefix: {draftOrderNumberConfig.prefix || 'N/A'} | ORG: {draftOrderNumberConfig.orgCode}
                    </div>
                  </div>
                </div>

                <div className="text-xs text-gray-500">
                  <p><strong>Token Reference:</strong></p>
                  <ul className="mt-1 space-y-1">
                    <li><code>{'{YYYY}'}</code> - 4-digit year</li>
                    <li><code>{'{YY}'}</code> - 2-digit year</li>
                    <li><code>{'{MM}'}</code> - Month (01-12)</li>
                    <li><code>{'{DD}'}</code> - Day (01-31)</li>
                    <li><code>{'{DOY}'}</code> - Day of year (001-366)</li>
                    <li><code>{'{MOD}'}</code> - Modality code</li>
                    <li><code>{'{ORG}'}</code> - Organization code</li>
                    <li><code>{'{SITE}'}</code> - Site code</li>
                    <li><code>{'{SEQn}'}</code> - Sequence number (n=padding)</li>
                    <li><code>{'{RANDn}'}</code> - Random digits (n=length)</li>
                  </ul>
                  <p className="mt-2"><strong>Order Number Notes:</strong></p>
                  <ul className="mt-1 space-y-1">
                    <li>• Order numbers are typically prefixed (e.g., ORD)</li>
                    <li>• Default padding is 5 digits for sequence</li>
                    <li>• Use daily reset for high-volume facilities</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Widgets Tab */}
      {activeTab === 'widgets' && (
        <div className="space-y-6">
          {/* Worklist Widget Configuration */}
          <div className="card">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold">Worklist Widget</h2>
                <p className="text-sm text-gray-600 mt-1">Configure the sidebar worklist widget that shows pending studies</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={cfg.worklistWidget?.enabled ?? true}
                  onChange={(e) => {
                    const newConfig = {
                      ...cfg,
                      worklistWidget: {
                        ...cfg.worklistWidget,
                        enabled: e.target.checked
                      }
                    };
                    setCfg(newConfig);
                  }}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                <span className="ml-3 text-sm font-medium text-gray-700">
                  {cfg.worklistWidget?.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </label>
            </div>

            <div className="space-y-4">
              {/* API Configuration */}
              <div>
                <label className="flex items-center mb-2">
                  <input
                    type="checkbox"
                    checked={cfg.worklistWidget?.useBackendApi ?? true}
                    onChange={(e) => {
                      const newConfig = {
                        ...cfg,
                        worklistWidget: {
                          ...cfg.worklistWidget,
                          useBackendApi: e.target.checked
                        }
                      };
                      setCfg(newConfig);
                    }}
                    className="mr-2 rounded"
                  />
                  <span className="text-sm font-medium">Use Backend API</span>
                </label>
                <p className="text-xs text-gray-500 ml-6">When enabled, widget fetches data from the configured API endpoint. When disabled, uses internal mock/fallback data.</p>
              </div>

              {cfg.worklistWidget?.useBackendApi && (
                <div>
                  <label className="block text-sm font-medium mb-2">API Endpoint URL</label>
                  <input
                    type="url"
                    value={cfg.worklistWidget?.apiUrl || 'http://localhost:8003/api/worklist'}
                    onChange={(e) => {
                      const newConfig = {
                        ...cfg,
                        worklistWidget: {
                          ...cfg.worklistWidget,
                          apiUrl: e.target.value
                        }
                      };
                      setCfg(newConfig);
                    }}
                    placeholder="http://localhost:8003/api/worklist"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">The backend API endpoint that returns worklist data</p>
                </div>
              )}

              {/* Refresh Interval */}
              <div>
                <label className="block text-sm font-medium mb-2">Auto-Refresh Interval (seconds)</label>
                <div className="flex items-center gap-4">
                  <input
                    type="number"
                    min="5"
                    max="300"
                    value={(cfg.worklistWidget?.refreshInterval || 30000) / 1000}
                    onChange={(e) => {
                      const seconds = Math.max(5, Math.min(300, parseInt(e.target.value) || 30));
                      const newConfig = {
                        ...cfg,
                        worklistWidget: {
                          ...cfg.worklistWidget,
                          refreshInterval: seconds * 1000
                        }
                      };
                      setCfg(newConfig);
                    }}
                    className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <span className="text-sm text-gray-600">
                    Refreshes every {(cfg.worklistWidget?.refreshInterval || 30000) / 1000} seconds
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">How often the widget automatically refreshes data (5-300 seconds)</p>
              </div>

              {/* Max Items */}
              <div>
                <label className="block text-sm font-medium mb-2">Maximum Items to Display</label>
                <div className="flex items-center gap-4">
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={cfg.worklistWidget?.maxItems || 10}
                    onChange={(e) => {
                      const items = Math.max(1, Math.min(50, parseInt(e.target.value) || 10));
                      const newConfig = {
                        ...cfg,
                        worklistWidget: {
                          ...cfg.worklistWidget,
                          maxItems: items
                        }
                      };
                      setCfg(newConfig);
                    }}
                    className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <span className="text-sm text-gray-600">
                    Show up to {cfg.worklistWidget?.maxItems || 10} studies
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">Maximum number of worklist items to show in the widget (1-50)</p>
              </div>

              {/* Current Configuration Summary */}
              <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <h3 className="text-sm font-semibold mb-3">Current Configuration</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-600">Status:</span>
                    <span className={`ml-2 font-medium ${cfg.worklistWidget?.enabled ? 'text-green-600' : 'text-red-600'}`}>
                      {cfg.worklistWidget?.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Data Source:</span>
                    <span className="ml-2 font-medium text-blue-600">
                      {cfg.worklistWidget?.useBackendApi ? 'Backend API' : 'Mock/Fallback'}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-600">API URL:</span>
                    <span className="ml-2 font-mono text-xs text-gray-800 break-all">
                      {cfg.worklistWidget?.apiUrl || 'http://localhost:8003/api/worklist'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Refresh:</span>
                    <span className="ml-2 font-medium">
                      {(cfg.worklistWidget?.refreshInterval || 30000) / 1000}s
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Max Items:</span>
                    <span className="ml-2 font-medium">
                      {cfg.worklistWidget?.maxItems || 10}
                    </span>
                  </div>
                </div>
              </div>

              {/* Help Text */}
              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h4 className="text-sm font-semibold text-blue-900 mb-2">How to use:</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• The worklist widget appears as a collapsible sidebar on the right side of the screen</li>
                  <li>• Click the "WORKLIST" button to open/close the widget</li>
                  <li>• The widget automatically refreshes at the configured interval when open</li>
                  <li>• Click the refresh icon in the widget header to manually refresh</li>
                  <li>• Backend API should return an array of worklist items with patient and study information</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Floating Worklist Widget Configuration */}
          <div className="card">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold">Floating Worklist Menu</h2>
                <p className="text-sm text-gray-600 mt-1">Enable or disable the floating worklist menu button on the right side of the screen</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={cfg.floatingWorklistWidget?.enabled ?? true}
                  onChange={(e) => {
                    const newConfig = {
                      ...cfg,
                      floatingWorklistWidget: {
                        ...cfg.floatingWorklistWidget,
                        enabled: e.target.checked
                      }
                    };
                    setCfg(newConfig);
                  }}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                <span className="ml-3 text-sm font-medium text-gray-700">
                  {cfg.floatingWorklistWidget?.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </label>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h4 className="text-sm font-semibold text-blue-900 mb-2">Status:</h4>
                <p className="text-sm text-blue-800">
                  {cfg.floatingWorklistWidget?.enabled
                    ? '✓ Floating worklist menu is currently ENABLED. The WORKLIST button will appear on the right side of the screen.'
                    : '✗ Floating worklist menu is currently DISABLED. The WORKLIST button will not appear.'}
                </p>
              </div>

              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <h3 className="text-sm font-semibold mb-3">Preview</h3>
                <div className="relative h-32 border-2 border-dashed border-gray-300 rounded-lg bg-white">
                  {cfg.floatingWorklistWidget?.enabled && (
                    <button className="absolute right-0 top-1/2 -translate-y-1/2 bg-blue-600 text-white px-2 py-4 rounded-l-lg shadow-lg hover:bg-blue-700 text-xs font-semibold">
                      WORKLIST
                    </button>
                  )}
                  <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                    {cfg.floatingWorklistWidget?.enabled ? 'Floating menu preview' : 'Menu disabled - no button shown'}
                  </div>
                </div>
              </div>

              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <h4 className="text-sm font-semibold text-amber-900 mb-2">Note:</h4>
                <p className="text-sm text-amber-800">
                  This setting controls the visibility of the floating worklist menu button. When enabled, the button appears on the right side of the screen. When disabled, the button is hidden but the worklist widget configuration above still applies.
                </p>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => {
                setCfg(cfg);
                alert('Widget settings discarded.');
              }}
              className="px-6 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                try {
                  // Save to backend if enabled
                  if (ui?.backendEnabled) {
                    const { updateSettings } = await import('../services/settingsService');
                    const updatedSettings = {
                      ...cfg,
                      worklistWidget: cfg.worklistWidget,
                      floatingWorklistWidget: cfg.floatingWorklistWidget
                    };
                    await updateSettings(updatedSettings);
                    alert('Widget settings saved to backend successfully!');
                  } else {
                    // Save locally only
                    saveConfig(cfg);
                    alert('Widget settings saved locally!');
                  }
                } catch (error) {
                  console.error('Failed to save widget settings:', error);
                  alert('Failed to save widget settings: ' + error.message);
                }
              }}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Save Settings
            </button>
          </div>
        </div>
      )}

      {/* Integration Tab */}
      {activeTab === 'integration' && (
        <div className="space-y-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              {integrationTabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveIntegrationTab(tab.id)}
                  className={`
                    py-2 px-1 border-b-2 font-medium text-sm flex items-center gap-2
                    ${activeIntegrationTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }
                  `}
                >
                  <span>{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* DICOM Router Configuration */}
          {activeIntegrationTab === 'dicom' && (
            <div className="card">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">DICOM Router Configuration</h2>
                <StorageIndicator storageType="external" />
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="col-span-3">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={draftRegistry.dicomRouter?.enabled || false}
                        onChange={e => updateModuleConfig('dicomRouter', 'enabled', e.target.checked)}
                      />
                      <span className="text-sm font-medium">Enable DICOM Router Integration</span>
                    </label>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium mb-1">Router API URL</label>
                    <input
                      className="w-full border rounded px-3 py-2 text-sm"
                      value={draftRegistry.dicomRouter?.apiUrl || ''}
                      onChange={e => updateModuleConfig('dicomRouter', 'apiUrl', e.target.value)}
                      placeholder="http://localhost:8080/api/dicom"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">API Timeout (ms)</label>
                    <input
                      type="number"
                      className="w-full border rounded px-3 py-2 text-sm"
                      value={draftRegistry.dicomRouter?.timeoutMs || 30000}
                      onChange={e => updateModuleConfig('dicomRouter', 'timeoutMs', parseInt(e.target.value) || 30000)}
                      min="1000"
                      step="1000"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Organization ID</label>
                    <input
                      className="w-full border rounded px-3 py-2 text-sm"
                      value={draftRegistry.dicomRouter?.organizationId || ''}
                      onChange={e => updateModuleConfig('dicomRouter', 'organizationId', e.target.value)}
                      placeholder="Organization ID"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Router Node AE</label>
                    <input
                      className="w-full border rounded px-3 py-2 text-sm"
                      value={draftRegistry.dicomRouter?.routerAeTitle || ''}
                      onChange={e => updateModuleConfig('dicomRouter', 'routerAeTitle', e.target.value)}
                      placeholder="ROUTER"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Default Station AE</label>
                    <input
                      className="w-full border rounded px-3 py-2 text-sm"
                      value={draftRegistry.dicomRouter?.defaultStationAe || ''}
                      onChange={e => updateModuleConfig('dicomRouter', 'defaultStationAe', e.target.value)}
                      placeholder="STATION"
                    />
                  </div>
                </div>

                <div className="flex gap-2 pt-4 border-t">
                  <button
                    type="button"
                    className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                    onClick={async () => {
                      try {
                        const client = apiClient('dicomRouter');
                        const response = await client.get('/health');
                        if (response.status === 'ok') {
                          alert('DICOM Router connection successful!');
                        } else {
                          throw new Error('Unexpected response: ' + JSON.stringify(response));
                        }
                      } catch (error) {
                        alert('DICOM Router connection failed: ' + error.message);
                      }
                    }}
                  >
                    Test Router Connection
                  </button>
                  <button
                    type="button"
                    className="px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                    onClick={onSaveRegistry}
                  >
                    Save Router Settings
                  </button>
                </div>

                <div className="text-xs text-gray-500 bg-blue-50 p-3 rounded">
                  <p><strong>DICOM Router Configuration:</strong></p>
                  <ul className="mt-1 space-y-1">
                    <li><strong>Router API URL:</strong> Backend API endpoint for DICOM routing</li>
                    <li><strong>Organization ID:</strong> Your facility's unique identifier</li>
                    <li><strong>Router Node AE:</strong> AE Title of the DICOM router</li>
                    <li><strong>Default Station AE:</strong> Default AE Title for workstations</li>
                    <li><strong>Timeout:</strong> Maximum time to wait for router response</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* MWL SCP Configuration */}
          {activeIntegrationTab === 'mwl' && (
            <div className="card">
              <MWLConfiguration />
            </div>
          )}

          {/* HL7 Integration */}
          {activeIntegrationTab === 'hl7' && (
            <div className="card">
              <HL7Configuration />
            </div>
          )}

          {/* SatuSehat Integration */}
          {activeIntegrationTab === 'satusehat' && (
            <div className="card">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">SATUSEHAT OAuth2 Integration</h2>
                <StorageIndicator storageType="external" />
              </div>
              <p className="mt-2 text-xs text-slate-500">
                *Simpan credential OAuth2 di backend untuk keamanan. Ikuti standar{' '}
                <a
                  href="https://satusehat.kemkes.go.id/platform/docs/id/api-catalogue/authentication/"
                  className="underline text-blue-600"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  SatuSehat OAuth2
                </a>.
              </p>

              {/* SatuSehat OAuth2 Settings */}
              <div className="mt-4 border-t pt-4">
                <h3 className="text-md font-medium mb-2">SatuSehat OAuth2 Settings</h3>
                <div className="space-y-3 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={draftRegistry.satusehat?.enabled || false} onChange={e => updateModuleConfig('satusehat', 'enabled', e.target.checked)} />
                    <span>Enable SatuSehat Integration</span>
                  </label>

                  {/* Show Mock Data Toggle - Superadmin/Developer Only */}
                  {isSuperUser && (
                    <div className="ml-6 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <label className="flex items-start gap-2">
                        <input 
                          type="checkbox" 
                          checked={satusehatShowMockData} 
                          onChange={e => {
                            const newValue = e.target.checked;
                            setSatusehatShowMockData(newValue);
                            localStorage.setItem('satusehat_show_mock_data', String(newValue));
                          }} 
                        />
                        <div>
                          <span className="font-medium text-amber-800">Show Mock Data for Patients</span>
                          <p className="text-xs text-amber-700 mt-1">
                            Display mockup/dummy patient data instead of real SatuSehat data.
                            Useful for development and testing without affecting production data.
                          </p>
                        </div>
                      </label>
                    </div>
                  )}

                  <label className="grid grid-cols-1 md:grid-cols-3 gap-2 items-center">
                    <span>Environment</span>
                    <select className="border rounded px-3 py-2 col-span-2" value={draftRegistry.satusehat?.env || 'sandbox'} onChange={e => {
                      const newEnv = e.target.value;
                      updateModuleConfig('satusehat', 'env', newEnv);
                      // Update tokenEndpoint based on environment
                      const defaultTokenEndpoint = newEnv === 'production'
                        ? 'https://api-satusehat.kemkes.go.id/oauth2/v1/token'
                        : 'https://api-satusehat-stg.dto.kemkes.go.id/oauth2/v1/token';
                      updateModuleConfig('satusehat', 'tokenEndpoint', defaultTokenEndpoint);
                    }}>
                      <option value="sandbox">Sandbox</option>
                      <option value="production">Production</option>
                    </select>
                  </label>

                  <label className="grid grid-cols-1 md:grid-cols-3 gap-2 items-center">
                    <span>Token Endpoint</span>
                    <div className="col-span-2">
                      <input
                        className="border rounded px-3 py-2 w-full mb-1"
                        value={draftRegistry.satusehat?.tokenEndpoint || (
                          draftRegistry.satusehat?.env === 'production'
                            ? 'https://api-satusehat.kemkes.go.id/oauth2/v1/token'
                            : 'https://api-satusehat-stg.dto.kemkes.go.id/oauth2/v1/token'
                        )}
                        onChange={e => updateModuleConfig('satusehat', 'tokenEndpoint', e.target.value)}
                        placeholder="Token endpoint URL"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="text-xs text-blue-600 hover:underline"
                          onClick={() => updateModuleConfig('satusehat', 'tokenEndpoint', 'https://api-satusehat-stg.dto.kemkes.go.id/oauth2/v1/token')}
                        >
                          Set Sandbox URL
                        </button>
                        <button
                          type="button"
                          className="text-xs text-blue-600 hover:underline"
                          onClick={() => updateModuleConfig('satusehat', 'tokenEndpoint', 'https://api-satusehat.kemkes.go.id/oauth2/v1/token')}
                        >
                          Set Production URL
                        </button>
                      </div>
                    </div>
                  </label>

                  <label className="grid grid-cols-1 md:grid-cols-3 gap-2 items-center">
                    <span>Organization ID</span>
                    <input className="border rounded px-3 py-2 col-span-2" value={draftRegistry.satusehat?.organizationId || ''} onChange={e => updateModuleConfig('satusehat', 'organizationId', e.target.value)} placeholder="Organization ID" autoComplete="off" />
                  </label>

                  <label className="grid grid-cols-1 md:grid-cols-3 gap-2 items-center">
                    <span>Client ID</span>
                    <input className="border rounded px-3 py-2 col-span-2" value={draftRegistry.satusehat?.clientId || ''} onChange={e => updateModuleConfig('satusehat', 'clientId', e.target.value)} placeholder="Client ID" autoComplete="off" />
                  </label>

                  <label className="grid grid-cols-1 md:grid-cols-3 gap-2 items-center">
                    <span>Client Secret</span>
                    <input type="password" className="border rounded px-3 py-2 col-span-2" value={draftRegistry.satusehat?.clientSecret || ''} onChange={e => updateModuleConfig('satusehat', 'clientSecret', e.target.value)} placeholder="Client Secret" autoComplete="off" />
                  </label>

                  <label className="grid grid-cols-1 md:grid-cols-3 gap-2 items-center">
                    <span>Grant Type</span>
                    <input className="border rounded px-3 py-2 col-span-2 bg-gray-100" value="client_credentials" readOnly />
                  </label>

                  <label className="grid grid-cols-1 md:grid-cols-3 gap-2 items-center">
                    <span>Scope (opsional)</span>
                    <input className="border rounded px-3 py-2 col-span-2" value={draftRegistry.satusehat?.scope || ''} onChange={e => updateModuleConfig('satusehat', 'scope', e.target.value)} placeholder="scope (opsional)" />
                  </label>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      className="px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                      onClick={onSaveRegistry}
                    >
                      Save SatuSehat Settings
                    </button>
                    <button
                      type="button"
                      className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                      onClick={async () => {
                        setTestingConnection(true);
                        try {
                          // Use API Gateway endpoint for token generation
                          // This endpoint handles caching, integrator coordination, and token management
                          // See: docs/satusehat-token-management.md
                          const client = apiClient('settings');
                          const response = await client.post('/satusehat/token/generate', {});

                          if (response && response.status === 'ok' && response.token) {
                            const tokenData = response.token;

                            // Calculate token expiry
                            const expiryTime = new Date();
                            expiryTime.setSeconds(expiryTime.getSeconds() + (tokenData.expires_in || 3600));

                            // Save token to state and localStorage
                            setSatusehatToken(tokenData.access_token);
                            setTokenExpiry(expiryTime);
                            localStorage.setItem('satusehat_token', tokenData.access_token);
                            localStorage.setItem('satusehat_token_expiry', expiryTime.getTime());

                            // Determine source message
                            const sourceMsg = response.source === 'cache'
                              ? '(Retrieved from cache)'
                              : '(Generated new token)';

                            const integratorMsg = response.integrator
                              ? '\n✓ Managed by satusehat-integrator'
                              : '';

                            // Show success message with source info
                            alert(
                              'Connection successful! ' + sourceMsg + '\n\n' +
                              'OAuth2 token received and saved.\n' +
                              'Token expires at: ' + expiryTime.toLocaleString() +
                              integratorMsg + '\n\n' +
                              'You can now use SatuSehat integration features.'
                            );
                          } else {
                            throw new Error('Invalid response from token generation endpoint');
                          }
                        } catch (error) {
                          console.error('Test connection failed:', error);

                          // Parse error message for better user feedback
                          let errorMsg = error.message || 'Unknown error';
                          let troubleshooting = [];

                          if (error.status === 403) {
                            errorMsg = 'Permission denied';
                            troubleshooting.push('You need permission: system:admin or setting:write');
                          } else if (error.status === 400) {
                            errorMsg = 'Configuration error';
                            troubleshooting.push('Check SatuSehat credentials in Integration settings');
                            troubleshooting.push('Ensure Client ID and Secret are configured');
                          } else if (error.status === 502 || error.status === 503) {
                            errorMsg = 'Service unavailable';
                            troubleshooting.push('SatuSehat OAuth2 service may be down');
                            troubleshooting.push('Try again later');
                          } else {
                            troubleshooting.push('Check Client ID and Secret are correct');
                            troubleshooting.push('Environment setting matches your credentials');
                            troubleshooting.push('Network connection is available');
                            troubleshooting.push('API Gateway is running');
                          }

                          alert(
                            'Connection failed!\n\n' +
                            'Error: ' + errorMsg + '\n\n' +
                            'Troubleshooting:\n' +
                            troubleshooting.map(t => '• ' + t).join('\n')
                          );
                        } finally {
                          setTestingConnection(false);
                        }
                      }}
                      disabled={testingConnection}
                    >
                      {testingConnection ? 'Testing...' : 'Test Connection'}
                    </button>
                  </div>

                  {/* Token Information Display */}
                  {satusehatToken && (
                    <div className="mt-4 p-3 bg-green-50 rounded border border-green-200">
                      <h4 className="font-medium text-green-800 mb-2">Token Information</h4>
                      <div className="text-sm text-green-700">
                        <p className="mb-1">
                          <span className="font-medium">Token:</span> {satusehatToken.slice(0, 30)}...
                        </p>
                        <p>
                          <span className="font-medium">Expires at:</span> {tokenExpiry?.toLocaleTimeString()}
                          {tokenExpiry && new Date() < tokenExpiry ? ' (Valid)' : ' (Expired)'}
                        </p>
                      </div>
                      <div className="mt-2">
                        <button
                          type="button"
                          className="px-3 py-1 bg-red-100 text-red-700 text-xs rounded hover:bg-red-200"
                          onClick={() => {
                            // Clear token from state and localStorage
                            setSatusehatToken(null);
                            setTokenExpiry(null);
                            localStorage.removeItem('satusehat_token');
                            localStorage.removeItem('satusehat_token_expiry');
                            alert('SatuSehat token has been cleared.');
                          }}
                        >
                          Clear Token
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="text-xs text-gray-500 bg-blue-50 p-2 rounded mt-2">
                    <p><strong>Petunjuk:</strong></p>
                    <ul className="list-disc ml-4 mt-1">
                      <li>Gunakan <code>client_id</code> dan <code>client_secret</code> yang didapat dari Kemenkes</li>
                      <li>Token endpoint berbeda untuk sandbox dan production</li>
                      <li>Grant type harus <code>client_credentials</code></li>
                      <li>Scope dapat dikosongkan jika tidak diwajibkan</li>
                      <li>Klik "Test Connection" untuk memverifikasi kredensial OAuth2</li>
                      <li>Health check untuk SatuSehat dilakukan terpisah melalui dashboard setelah autentikasi berhasil</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* AI Assistant Configuration */}
          {activeIntegrationTab === 'ai' && (
            <div className="card">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">AI Assistant Configuration</h2>
                <StorageIndicator storageType="browser" />
              </div>

              <div className="space-y-6">
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-amber-600">⚠️</span>
                    <h3 className="text-sm font-semibold text-amber-900">Experimental Feature</h3>
                  </div>
                  <p className="text-sm text-amber-800">
                    AI Assistant features are currently in development. Enabling this will allow the system to use Large Language Models (LLM) for analysis and automation.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <label className="flex items-center justify-between p-3 border rounded-lg bg-gray-50">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">Enable AI Assistant</span>
                        <span className="text-xs text-gray-500">Enable AI-powered features across the platform</span>
                      </div>
                      <input 
                        type="checkbox" 
                        className="w-5 h-5 text-blue-600"
                        checked={aiConfig.enabled}
                        onChange={e => setAiConfig(prev => ({ ...prev, enabled: e.target.checked }))}
                      />
                    </label>

                    <div>
                      <label className="block text-sm font-medium mb-1">AI Provider</label>
                      <select 
                        className="w-full border rounded px-3 py-2 text-sm"
                        value={aiConfig.provider}
                        onChange={e => setAiConfig(prev => ({ ...prev, provider: e.target.value }))}
                        disabled={!aiConfig.enabled}
                      >
                        <option value="google-gemini">Google Gemini (Recommended)</option>
                        <option value="openai">OpenAI (GPT)</option>
                        <option value="anthropic">Anthropic (Claude)</option>
                        <option value="local">Local Model (Ollama/LM Studio)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">Model Name</label>
                      <input 
                        type="text"
                        className="w-full border rounded px-3 py-2 text-sm font-mono"
                        value={aiConfig.model}
                        onChange={e => setAiConfig(prev => ({ ...prev, model: e.target.value }))}
                        placeholder="gemini-1.5-pro"
                        disabled={!aiConfig.enabled}
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">API Key</label>
                      <input 
                        type="password"
                        className="w-full border rounded px-3 py-2 text-sm"
                        value={aiConfig.apiKey}
                        onChange={e => setAiConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                        placeholder="Enter your API Key"
                        autoComplete="off"
                        disabled={!aiConfig.enabled}
                      />
                      <p className="text-[10px] text-gray-400 mt-1">*Keys are stored locally in this browser only.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Temperature</label>
                        <input 
                          type="number"
                          step="0.1"
                          min="0"
                          max="1"
                          className="w-full border rounded px-3 py-2 text-sm"
                          value={aiConfig.temperature}
                          onChange={e => setAiConfig(prev => ({ ...prev, temperature: parseFloat(e.target.value) }))}
                          disabled={!aiConfig.enabled}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Max Tokens</label>
                        <input 
                          type="number"
                          step="256"
                          className="w-full border rounded px-3 py-2 text-sm"
                          value={aiConfig.maxTokens}
                          onChange={e => setAiConfig(prev => ({ ...prev, maxTokens: parseInt(e.target.value) }))}
                          disabled={!aiConfig.enabled}
                        />
                      </div>
                    </div>

                    <label className="flex items-center gap-2 text-sm">
                      <input 
                        type="checkbox"
                        checked={aiConfig.debug}
                        onChange={e => setAiConfig(prev => ({ ...prev, debug: e.target.checked }))}
                        disabled={!aiConfig.enabled}
                      />
                      <span>Enable AI Debug Logs</span>
                    </label>
                  </div>
                </div>

                <div className="flex gap-2 pt-4 border-t">
                  <button
                    type="button"
                    className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                    onClick={() => {
                      localStorage.setItem('ai_assistant_config', JSON.stringify(aiConfig));
                      
                      // 1. Update the module registry
                      const newRegistry = { ...draftRegistry };
                      newRegistry.ai = {
                        ...newRegistry.ai,
                        enabled: aiConfig.enabled
                      };
                      setDraftRegistry(newRegistry);
                      saveRegistry(newRegistry);

                      // 2. Update the main app config (used by Layout and AIChatBot)
                      const newConfig = { ...ui };
                      newConfig.aiChat = {
                        ...newConfig.aiChat,
                        enabled: aiConfig.enabled
                      };
                      setUi(newConfig);
                      saveConfig(newConfig);
                      
                      alert('AI Assistant settings saved successfully.');
                    }}
                  >
                    Save AI Settings
                  </button>
                  <button
                    type="button"
                    className="px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded hover:bg-gray-50"
                    onClick={async () => {
                      if (!aiConfig.apiKey && aiConfig.provider !== 'local') {
                        alert('Please enter an API Key first.');
                        return;
                      }
                      alert('Connection test feature coming soon.');
                    }}
                    disabled={!aiConfig.enabled}
                  >
                    Test Connection
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Third Party Integrations */}
          {activeIntegrationTab === 'thirdparty' && (
            <div className="card">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">Third Party Integrations</h2>
                <StorageIndicator storageType="external" />
              </div>

              <div className="space-y-6">
                <div className="text-center py-8 bg-gray-50 rounded-lg">
                  <div className="text-4xl mb-2">🌐</div>
                  <h3 className="text-lg font-medium mb-1">Future Integrations</h3>
                  <p className="text-gray-500 text-sm">
                    This section will contain settings for additional third-party integrations.
                  </p>
                  <p className="text-gray-400 text-xs mt-2">
                    More integration options will be added here in future updates.
                  </p>
                </div>

                <div className="border rounded-lg p-4 bg-blue-50">
                  <h3 className="font-medium mb-2">Planned Integrations</h3>
                  <ul className="text-sm space-y-1">
                    <li className="flex items-center">
                      <span className="w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
                      <span>RIS/HIS System Integration</span>
                    </li>
                    <li className="flex items-center">
                      <span className="w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
                      <span>Laboratory Information System</span>
                    </li>
                    <li className="flex items-center">
                      <span className="w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
                      <span>Radiology Reporting Systems</span>
                    </li>
                    <li className="flex items-center">
                      <span className="w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
                      <span>Cloud Storage Providers</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}

        </div>
      )}

      {/* Notification Settings Tab */}
      {/* Notification Settings Tab - Using New Backend API Component */}
      {activeTab === 'notifications' && (
        <NotificationSettings />
      )}

      {/* PWA Settings Tab */}
      {activeTab === 'pwa' && (
        <PWASettings 
          config={pwaConfig}
          status={pwaStatus}
          onConfigChange={setPwaConfig}
          onStatusChange={setPwaStatus}
          onSave={savePWAConfig}
        />
      )}
    </div >
  )
}


