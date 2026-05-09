import { useEffect } from 'react';
import { startNotificationService, stopNotificationService } from '../services/notificationLogicService';

/**
 * NotificationManager
 * Headless component that manages the lifecycle of the notification service.
 * Should be mounted once at the top level of the app (e.g., in Layout or App).
 */
const NotificationManager = () => {
    useEffect(() => {
        // Start the service when the component mounts
        startNotificationService();

        // Stop the service when the component unmounts
        return () => {
            stopNotificationService();
        };
    }, []);

    // This component doesn't render anything visible
    return null;
};

export default NotificationManager;
