import { XMarkIcon, UserIcon, CalendarIcon, ClockIcon } from '@heroicons/react/24/outline';

export default function StudyDetails({ study, onClose }) {
  if (!study) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-xl border-l border-gray-200 z-30 overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Study Details</h2>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-100 rounded"
        >
          <XMarkIcon className="h-5 w-5 text-gray-500" />
        </button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-6">
        {/* Patient Information */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center">
            <UserIcon className="h-4 w-4 mr-2" />
            Patient Information
          </h3>
          <dl className="space-y-2">
            <div>
              <dt className="text-xs text-gray-500">Name</dt>
              <dd className="text-sm font-medium text-gray-900">{study.patientName}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Patient ID</dt>
              <dd className="text-sm font-medium text-gray-900">{study.patientId}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Date of Birth</dt>
              <dd className="text-sm font-medium text-gray-900">{study.patientDOB || 'N/A'}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Gender</dt>
              <dd className="text-sm font-medium text-gray-900">{study.patientGender || 'N/A'}</dd>
            </div>
          </dl>
        </div>

        {/* Study Information */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center">
            <CalendarIcon className="h-4 w-4 mr-2" />
            Study Information
          </h3>
          <dl className="space-y-2">
            <div>
              <dt className="text-xs text-gray-500">Study Description</dt>
              <dd className="text-sm font-medium text-gray-900">{study.studyDescription}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Accession Number</dt>
              <dd className="text-sm font-medium text-gray-900">{study.accessionNumber}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Study Date</dt>
              <dd className="text-sm font-medium text-gray-900">{study.studyDate}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Modality</dt>
              <dd className="text-sm font-medium text-gray-900">{study.modality}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Status</dt>
              <dd>
                <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                  study.status === 'completed' ? 'bg-green-100 text-green-800' :
                  study.status === 'in-progress' ? 'bg-blue-100 text-blue-800' :
                  'bg-yellow-100 text-yellow-800'
                }`}>
                  {study.status}
                </span>
              </dd>
            </div>
          </dl>
        </div>

        {/* Series Information */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Series</h3>
          <div className="space-y-2">
            {study.series?.map((series, idx) => (
              <div key={idx} className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-900">
                    Series {series.seriesNumber}
                  </span>
                  <span className="text-xs text-gray-500">
                    {series.instanceCount} images
                  </span>
                </div>
                <p className="text-xs text-gray-600">{series.seriesDescription}</p>
              </div>
            )) || (
              <p className="text-sm text-gray-500">No series information available</p>
            )}
          </div>
        </div>

        {/* Additional Information */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Additional Information</h3>
          <dl className="space-y-2">
            <div>
              <dt className="text-xs text-gray-500">Referring Physician</dt>
              <dd className="text-sm font-medium text-gray-900">{study.referringPhysician || 'N/A'}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Institution</dt>
              <dd className="text-sm font-medium text-gray-900">{study.institution || 'N/A'}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Study Instance UID</dt>
              <dd className="text-xs font-mono text-gray-600 break-all">{study.studyInstanceUID || 'N/A'}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
