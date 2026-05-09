import { BellIcon, CheckCircleIcon, ExclamationCircleIcon, InformationCircleIcon } from '@heroicons/react/24/outline';

export default function NotificationCenter({ onClose }) {
  const notifications = [
    {
      id: 1,
      type: 'success',
      title: 'Study uploaded successfully',
      message: 'CT Brain study has been archived',
      time: '5 min ago',
      read: false
    },
    {
      id: 2,
      type: 'warning',
      title: 'Storage warning',
      message: 'Storage usage is at 85%',
      time: '1 hour ago',
      read: false
    },
    {
      id: 3,
      type: 'info',
      title: 'New worklist item',
      message: 'MRI Spine scheduled for 10:30',
      time: '2 hours ago',
      read: true
    }
  ];

  const getIcon = (type) => {
    switch (type) {
      case 'success':
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
      case 'warning':
        return <ExclamationCircleIcon className="h-5 w-5 text-yellow-500" />;
      case 'info':
        return <InformationCircleIcon className="h-5 w-5 text-blue-500" />;
      default:
        return <BellIcon className="h-5 w-5 text-gray-500" />;
    }
  };

  return (
    <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-gray-200 z-50">
      <div className="p-4 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900">Notifications</h3>
      </div>
      
      <div className="max-h-96 overflow-y-auto divide-y divide-gray-100">
        {notifications.map((notif) => (
          <div
            key={notif.id}
            className={`p-4 hover:bg-gray-50 cursor-pointer ${
              !notif.read ? 'bg-blue-50' : ''
            }`}
          >
            <div className="flex items-start space-x-3">
              {getIcon(notif.type)}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 text-sm">{notif.title}</p>
                <p className="text-sm text-gray-600 mt-1">{notif.message}</p>
                <p className="text-xs text-gray-400 mt-1">{notif.time}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="p-3 border-t border-gray-200 text-center">
        <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
          View all notifications
        </button>
      </div>
    </div>
  );
}
