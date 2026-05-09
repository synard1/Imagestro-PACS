import { XMarkIcon, PlusIcon, MagnifyingGlassIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { useNavigate } from 'react-router-dom';

export default function QuickActions({ onClose }) {
  const navigate = useNavigate();

  const actions = [
    { 
      id: 'new-order', 
      label: 'New Order', 
      icon: PlusIcon, 
      color: 'blue',
      action: () => navigate('/orders/new')
    },
    { 
      id: 'search-study', 
      label: 'Search Study', 
      icon: MagnifyingGlassIcon, 
      color: 'green',
      action: () => navigate('/studies')
    },
    { 
      id: 'new-report', 
      label: 'New Report', 
      icon: DocumentTextIcon, 
      color: 'purple',
      action: () => navigate('/reports/new')
    }
  ];

  return (
    <aside className="w-64 bg-white border-l border-gray-200 flex flex-col shadow-lg">
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Quick Actions</h2>
        <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
          <XMarkIcon className="h-5 w-5 text-gray-500" />
        </button>
      </div>

      <div className="p-4 space-y-2">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              onClick={action.action}
              className={`w-full flex items-center space-x-3 p-3 rounded-lg hover:bg-${action.color}-50 transition-colors border border-gray-200 hover:border-${action.color}-300`}
            >
              <Icon className={`h-5 w-5 text-${action.color}-600`} />
              <span className="font-medium text-gray-700">{action.label}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
