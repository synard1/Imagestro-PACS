import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getStudyThumbnail } from '../../services/studyService';
import wadoService from '../../services/wadoService';
import StudyActions from '../studies/StudyActions';
import AuthenticatedImage from '../common/AuthenticatedImage';

/**
 * Enhanced Study Card Component
 * Displays study information with thumbnail
 */
export default function StudyCard({ study, compact = false, onView, onReport, onDelete, onArchive }) {
  const navigate = useNavigate();
  
  // Unified access for study properties (backend snake_case vs frontend camelCase)
  const studyInstanceUID = study.study_instance_uid || study.studyInstanceUID || study.id;
  const patientName = study.patient_name || study.patientName || study.patient?.name || 'Unknown Patient';
  const patientId = study.patient_id || study.patientId || study.patient?.mrn || 'No ID';
  const studyDescription = study.study_description || study.studyDescription || study.description || 'No description';
  const studyDate = study.study_date || study.studyDate || 'N/A';
  const modality = study.modality || 'N/A';
  const status = study.status || 'unknown';
  const seriesCount = study.number_of_series || study.seriesCount || (study.series?.length) || 0;

  // Resolve thumbnail URL
  const thumbnailUrl = useMemo(() => {
    // 1. Try dedicated thumbnail fields
    let seriesUID = study.thumbnail_series_uid;
    let instanceUID = study.thumbnail_instance_uid;
    
    // 2. Fallback to nested data if dedicated fields missing
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

    if (studyInstanceUID && seriesUID && instanceUID) {
      return wadoService.getThumbnailUrl(studyInstanceUID, seriesUID, instanceUID, 150);
    }
    return null;
  }, [study, studyInstanceUID]);

  const handleClick = () => {
    // Navigate to study detail page
    navigate(`/study/${studyInstanceUID}`);
  };

  const getStatusColor = (status) => {
    const statusMap = {
      completed: 'bg-green-100 text-green-800',
      in_progress: 'bg-blue-100 text-blue-800',
      scheduled: 'bg-yellow-100 text-yellow-800',
      cancelled: 'bg-red-100 text-red-800',
    };
    return statusMap[status] || 'bg-gray-100 text-gray-800';
  };

  const getModalityColor = (modality) => {
    const modalityMap = {
      CT: 'bg-purple-100 text-purple-800',
      MRI: 'bg-indigo-100 text-indigo-800',
      'X-Ray': 'bg-blue-100 text-blue-800',
      US: 'bg-cyan-100 text-cyan-800',
      CR: 'bg-teal-100 text-teal-800',
      DR: 'bg-green-100 text-green-800',
    };
    return modalityMap[modality] || 'bg-gray-100 text-gray-800';
  };

  if (compact) {
    return (
      <div
        onClick={handleClick}
        className="flex items-center gap-3 p-2 hover:bg-slate-50 cursor-pointer rounded border-b border-slate-100"
      >
        <div className="w-12 h-12 bg-slate-200 rounded flex items-center justify-center text-slate-500 text-xs flex-shrink-0">
          {modality}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{patientName}</div>
          <div className="text-xs text-slate-500 truncate">{studyDescription}</div>
        </div>
        <div className="text-xs text-slate-400">{studyDate}</div>
      </div>
    );
  }

  return (
    <div
      onClick={handleClick}
      className="bg-white border border-slate-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer relative group"
    >
      {/* Actions Overlay (visible on hover) */}
      <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
        <StudyActions 
          study={study}
          onView={onView || (() => navigate(`/study/${studyInstanceUID}`))}
          onReport={onReport || (() => navigate(`/report/${studyInstanceUID}`))}
          onExport={() => console.log('Export', study)}
          onShare={() => console.log('Share', study)}
          onDelete={onDelete}
          onArchive={onArchive}
        />
      </div>

      {/* Thumbnail */}
      <div className="w-full h-32 bg-slate-100 rounded mb-3 flex items-center justify-center overflow-hidden">
        {thumbnailUrl ? (
          <AuthenticatedImage 
            src={thumbnailUrl} 
            alt="Study thumbnail" 
            className="w-full h-full object-cover"
            fallbackText={modality}
          />
        ) : (
          <div className="text-center">
            <div className="text-2xl mb-1">🖼️</div>
            <div className="text-xs">{modality}</div>
          </div>
        )}
      </div>

      {/* Study Info */}
      <div className="space-y-2">
        <div>
          <div className="font-semibold text-sm truncate">{patientName}</div>
          <div className="text-xs text-slate-500 truncate">{patientId}</div>
        </div>

        <div className="text-xs text-slate-600 truncate">
          {studyDescription}
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className={`inline-block px-2 py-0.5 text-xs rounded ${getModalityColor(modality)}`}>
            {modality}
          </span>
          <span className="text-xs text-slate-500">{studyDate}</span>
        </div>

        <div className="flex items-center justify-between">
          <span className={`inline-block px-2 py-0.5 text-xs rounded ${getStatusColor(status)}`}>
            {status}
          </span>
          {seriesCount > 0 && (
            <span className="text-xs text-slate-500">{seriesCount} series</span>
          )}
        </div>
      </div>
    </div>
  );
}