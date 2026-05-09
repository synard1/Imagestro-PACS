import { useState, useEffect } from 'react';
import { 
  XMarkIcon, 
  ClockIcon,
  CheckCircleIcon,
  ExclamationCircleIcon
} from '@heroicons/react/24/outline';

export default function WorklistPanel({ onClose, onStudySelect }) {
  const [worklist, setWorklist] = useState([]);
  const [filter, setFilter] = useState('all'); // all, pending, in-progress, completed

  useEffect(() => {
    // Load worklist from localStorage or API
    const mockWorklist = [
      {
        id: 1,
        patientName: 'John Doe',
        patientId: 'P001',
        accessionNumber: 'ACC001',
        modality: 'CT',
        studyDescription: 'CT Brain',
        scheduledTime: '2025-11-15 09:00',
        status: 'pending',
        priority: 'routine'
      },
      {
        id: 2,
        patientName: 'Jane Smith',
        patientId: 'P002',
        accessionNumber: 'ACC002',
        modality: 'MRI',
        studyDescription: 'MRI Spine',
        scheduledTime: '2025-11-15 10:30',
        status: 'in-progress',
        priority: 'urgent'
      },
      {
        id: 3,
        patientName: 'Bob Johnson',
        patientId: 'P003',
        accessionNumber: 'ACC003',
        modality: 'XR',
        studyDescription: 'Chest X-Ray',
        scheduledTime: '2025-11-15 11:00',
        status: 'completed',
        priority: 'routine'
      }
    ];
    setWorklist(mockWorklist);
  }, []);

  const filteredWorklist = worklist.filter(item => {
    if (filter === 'all') return true;
    return item.status === filter;
  });

  const getStatusIcon = (status) => {
    switch (status) {
      case 'pending':
        return <ClockIcon className="h-5 w-5 text-yellow-500" />;
      case 'in-progress':
        return <ExclamationCircleIcon className="h-5 w-5 text-blue-500" />;
      case 'completed':
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'in-progress':
        return 'bg-blue-100 text-blue-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <aside className="w-80 bg-white border-r border-gray-200 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Worklist</h2>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-100 rounded"
        >
          <XMarkIcon className="h-5 w-5 text-gray-500" />
        </button>
      </div>

      {/* Filters */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex space-x-2">
          {['all', 'pending', 'in-progress', 'completed'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 text-xs font-medium rounded-full ${
                filter === f
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {f.replace('-', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Worklist Items */}
      <div className="flex-1 overflow-y-auto">
        {filteredWorklist.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            No items in worklist
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredWorklist.map((item) => (
              <div
                key={item.id}
                onClick={() => onStudySelect(item.id)}
                className="p-4 hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-900">{item.patientName}</h3>
                    <p className="text-sm text-gray-500">{item.patientId}</p>
                  </div>
                  {getStatusIcon(item.status)}
                </div>
                
                <div className="space-y-1">
                  <p className="text-sm font-medium text-gray-700">{item.studyDescription}</p>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded">
                      {item.modality}
                    </span>
                    <span className={`text-xs px-2 py-1 rounded ${getStatusColor(item.status)}`}>
                      {item.status}
                    </span>
                    {item.priority === 'urgent' && (
                      <span className="text-xs px-2 py-1 bg-red-100 text-red-800 rounded">
                        URGENT
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">
                    <ClockIcon className="h-3 w-3 inline mr-1" />
                    {item.scheduledTime}
                  </p>
                  <p className="text-xs text-gray-500">Acc: {item.accessionNumber}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer Stats */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-lg font-bold text-yellow-600">
              {worklist.filter(i => i.status === 'pending').length}
            </div>
            <div className="text-xs text-gray-600">Pending</div>
          </div>
          <div>
            <div className="text-lg font-bold text-blue-600">
              {worklist.filter(i => i.status === 'in-progress').length}
            </div>
            <div className="text-xs text-gray-600">In Progress</div>
          </div>
          <div>
            <div className="text-lg font-bold text-green-600">
              {worklist.filter(i => i.status === 'completed').length}
            </div>
            <div className="text-xs text-gray-600">Completed</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
