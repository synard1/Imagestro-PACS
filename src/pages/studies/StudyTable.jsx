import { useState, useMemo } from 'react';
import StudyActions from '../../components/studies/StudyActions';
import AuthenticatedImage from '../../components/common/AuthenticatedImage';
import wadoService from '../../services/wadoService';

export default function StudyTable({ studies, onStudySelect, onView, onReport, onDelete, onArchive }) {
  const [selectedStudies, setSelectedStudies] = useState([]);

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedStudies(studies.map(s => s.id));
    } else {
      setSelectedStudies([]);
    }
  };

  const handleSelectStudy = (studyId) => {
    setSelectedStudies(prev =>
      prev.includes(studyId)
        ? prev.filter(id => id !== studyId)
        : [...prev, studyId]
    );
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'in-progress': return 'bg-blue-100 text-blue-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left w-10">
              <input
                type="checkbox"
                checked={selectedStudies.length === studies.length && studies.length > 0}
                onChange={handleSelectAll}
                className="rounded border-gray-300"
              />
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Preview</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Patient</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Study</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date/Time</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Modality</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Images</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {studies.map((study) => {
            // Resolve thumbnail URL
            let seriesUID = study.thumbnail_series_uid;
            let instanceUID = study.thumbnail_instance_uid;
            
            if (!seriesUID || !instanceUID) {
              const firstSeries = study.series?.[0];
              if (firstSeries) {
                seriesUID = firstSeries.series_instance_uid || firstSeries.seriesInstanceUID;
                const firstInstance = firstSeries.instances?.[0];
                if (firstInstance) {
                  instanceUID = firstInstance.sop_instance_uid || firstInstance.sopInstanceUID;
                }
              }
            }

            const studyInstanceUID = study.study_instance_uid || study.id;
            const thumbUrl = (studyInstanceUID && seriesUID && instanceUID) 
              ? wadoService.getThumbnailUrl(studyInstanceUID, seriesUID, instanceUID, 60)
              : null;

            return (
              <tr
                key={study.id}
                onClick={() => onStudySelect(study)}
                className="hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <td className="px-4 py-4">
                  <input
                    type="checkbox"
                    checked={selectedStudies.includes(study.id)}
                    onChange={() => handleSelectStudy(study.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded border-gray-300"
                  />
                </td>
                <td className="px-4 py-4">
                  <div className="w-12 h-12 bg-gray-100 rounded overflow-hidden border border-gray-200 flex items-center justify-center">
                    {thumbUrl ? (
                      <AuthenticatedImage 
                        src={thumbUrl} 
                        alt="Preview"
                        className="w-full h-full object-cover"
                        showLoader={false}
                        fallbackText={study.modality}
                      />
                    ) : (
                      <span className="text-[10px] text-gray-400 font-medium">{study.modality}</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div>
                    <div className="font-medium text-gray-900">{(study.patientName || 'Unknown').replace(/\^/g, ' ')}</div>
                    <div className="text-sm text-gray-500">{study.patientId}</div>
                  </div>
                </td>
              <td className="px-4 py-4">
                <div>
                  <div className="font-medium text-gray-900">{study.studyDescription}</div>
                  <div className="text-sm text-gray-500">{study.accessionNumber}</div>
                </div>
              </td>
              <td className="px-4 py-4">
                <div className="text-sm text-gray-900">{study.studyDate}</div>
                <div className="text-sm text-gray-500">{study.studyTime}</div>
              </td>
              <td className="px-4 py-4">
                <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded">
                  {study.modality}
                </span>
              </td>
              <td className="px-4 py-4">
                <span className={`px-2 py-1 text-xs font-medium rounded ${getStatusColor(study.status)}`}>
                  {study.status}
                </span>
              </td>
              <td className="px-4 py-4 text-sm text-gray-900">
                {study.numberOfInstances || 0}
              </td>
              <td className="px-4 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                <StudyActions
                  study={study}
                  onView={onView}
                  onReport={onReport}
                  onExport={() => console.log('Export', study)}
                  onShare={() => console.log('Share', study)}
                  onDelete={onDelete}
                  onArchive={onArchive}
                />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);
}
