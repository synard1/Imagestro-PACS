import React, { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useNotification } from '../../contexts/NotificationContext'
import { PermissionGate } from '../../components/PermissionGate'
import LoadingSpinner from '../../components/LoadingSpinner'
import { orthancAPI } from '../../services/api'

function Orthanc() {
  const { hasPermission } = useAuth()
  const { showNotification } = useNotification()
  
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('patients')
  const [patients, setPatients] = useState([])
  const [studies, setStudies] = useState([])
  const [series, setSeries] = useState([])
  const [instances, setInstances] = useState([])
  const [selectedPatient, setSelectedPatient] = useState(null)
  const [selectedStudy, setSelectedStudy] = useState(null)
  const [selectedSeries, setSelectedSeries] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [systemInfo, setSystemInfo] = useState(null)

  // Load system information
  const loadSystemInfo = async () => {
    try {
      const response = await orthancAPI.getSystemInfo()
      setSystemInfo(response.data)
    } catch (error) {
      console.error('Failed to load system info:', error)
    }
  }

  // Load patients
  const loadPatients = async () => {
    try {
      setLoading(true)
      const response = await orthancAPI.getPatients()
      setPatients(response.data)
    } catch (error) {
      showNotification({
        type: 'error',
        title: 'Error',
        message: 'Failed to load patients: ' + error.message
      })
    } finally {
      setLoading(false)
    }
  }

  // Load studies for a patient
  const loadStudies = async (patientId) => {
    try {
      setLoading(true)
      const response = await orthancAPI.getStudies(patientId)
      setStudies(response.data)
      setSelectedPatient(patientId)
      setActiveTab('studies')
    } catch (error) {
      showNotification({
        type: 'error',
        title: 'Error',
        message: 'Failed to load studies: ' + error.message
      })
    } finally {
      setLoading(false)
    }
  }

  // Load series for a study
  const loadSeries = async (studyId) => {
    try {
      setLoading(true)
      const response = await orthancAPI.getSeries(studyId)
      setSeries(response.data)
      setSelectedStudy(studyId)
      setActiveTab('series')
    } catch (error) {
      showNotification({
        type: 'error',
        title: 'Error',
        message: 'Failed to load series: ' + error.message
      })
    } finally {
      setLoading(false)
    }
  }

  // Load instances for a series
  const loadInstances = async (seriesId) => {
    try {
      setLoading(true)
      const response = await orthancAPI.getInstances(seriesId)
      setInstances(response.data)
      setSelectedSeries(seriesId)
      setActiveTab('instances')
    } catch (error) {
      showNotification({
        type: 'error',
        title: 'Error',
        message: 'Failed to load instances: ' + error.message
      })
    } finally {
      setLoading(false)
    }
  }

  // Search functionality
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      loadPatients()
      return
    }

    try {
      setLoading(true)
      const response = await orthancAPI.searchPatients(searchQuery)
      setPatients(response.data)
      setActiveTab('patients')
    } catch (error) {
      showNotification({
        type: 'error',
        title: 'Error',
        message: 'Search failed: ' + error.message
      })
    } finally {
      setLoading(false)
    }
  }

  // Download DICOM file
  const downloadDicom = async (instanceId, filename) => {
    try {
      const response = await orthancAPI.downloadInstance(instanceId)
      const blob = new Blob([response.data], { type: 'application/dicom' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename || `instance_${instanceId}.dcm`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      
      showNotification({
        type: 'success',
        title: 'Success',
        message: 'DICOM file downloaded successfully'
      })
    } catch (error) {
      showNotification({
        type: 'error',
        title: 'Error',
        message: 'Failed to download DICOM file: ' + error.message
      })
    }
  }

  // Delete resource
  const deleteResource = async (resourceType, resourceId) => {
    if (!confirm(`Are you sure you want to delete this ${resourceType}?`)) {
      return
    }

    try {
      await orthancAPI.deleteResource(resourceType, resourceId)
      showNotification({
        type: 'success',
        title: 'Success',
        message: `${resourceType} deleted successfully`
      })
      
      // Refresh current view
      if (resourceType === 'patient') {
        loadPatients()
      } else if (resourceType === 'study' && selectedPatient) {
        loadStudies(selectedPatient)
      } else if (resourceType === 'series' && selectedStudy) {
        loadSeries(selectedStudy)
      } else if (resourceType === 'instance' && selectedSeries) {
        loadInstances(selectedSeries)
      }
    } catch (error) {
      showNotification({
        type: 'error',
        title: 'Error',
        message: `Failed to delete ${resourceType}: ` + error.message
      })
    }
  }

  // Format date
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A'
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    } catch {
      return dateString
    }
  }

  // Format file size
  const formatFileSize = (bytes) => {
    if (!bytes) return 'N/A'
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i]
  }

  // Load initial data
  useEffect(() => {
    loadPatients()
    loadSystemInfo()
  }, [])

  // Navigation breadcrumb
  const renderBreadcrumb = () => {
    const items = []
    
    if (activeTab === 'patients' || !selectedPatient) {
      items.push({ label: 'Patients', active: true })
    } else {
      items.push({ 
        label: 'Patients', 
        active: false, 
        onClick: () => {
          setActiveTab('patients')
          setSelectedPatient(null)
          setSelectedStudy(null)
          setSelectedSeries(null)
        }
      })
    }

    if (selectedPatient) {
      const patient = patients.find(p => p.id === selectedPatient)
      if (activeTab === 'studies') {
        items.push({ label: patient?.main_dicom_tags?.PatientName || 'Unknown', active: true })
      } else {
        items.push({ 
          label: patient?.main_dicom_tags?.PatientName || 'Unknown', 
          active: false,
          onClick: () => loadStudies(selectedPatient)
        })
      }
    }

    if (selectedStudy) {
      const study = studies.find(s => s.id === selectedStudy)
      if (activeTab === 'series') {
        items.push({ label: study?.main_dicom_tags?.StudyDescription || 'Study', active: true })
      } else {
        items.push({ 
          label: study?.main_dicom_tags?.StudyDescription || 'Study', 
          active: false,
          onClick: () => loadSeries(selectedStudy)
        })
      }
    }

    if (selectedSeries && activeTab === 'instances') {
      const seriesItem = series.find(s => s.id === selectedSeries)
      items.push({ label: seriesItem?.main_dicom_tags?.SeriesDescription || 'Series', active: true })
    }

    return (
      <nav className="flex mb-4" aria-label="Breadcrumb">
        <ol className="flex items-center space-x-2">
          {items.map((item, index) => (
            <li key={index} className="flex items-center">
              {index > 0 && <span className="mx-2 text-gray-400">/</span>}
              {item.active ? (
                <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  {item.label}
                </span>
              ) : (
                <button
                  onClick={item.onClick}
                  className="text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  {item.label}
                </button>
              )}
            </li>
          ))}
        </ol>
      </nav>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Orthanc DICOM Server
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Browse and manage DICOM studies, series, and instances
        </p>
      </div>

      {/* System Info */}
      {systemInfo && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 mb-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">
            System Information
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-500 dark:text-gray-400">Version:</span>
              <span className="ml-2 text-gray-900 dark:text-white">{systemInfo.version}</span>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Database:</span>
              <span className="ml-2 text-gray-900 dark:text-white">{systemInfo.database_version}</span>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Storage:</span>
              <span className="ml-2 text-gray-900 dark:text-white">{formatFileSize(systemInfo.storage_size)}</span>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Patients:</span>
              <span className="ml-2 text-gray-900 dark:text-white">{systemInfo.count_patients}</span>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 mb-6">
        <div className="flex items-center space-x-4">
          <div className="flex-1">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="Search patients by name, ID, or study description..."
            />
          </div>
          <button
            onClick={handleSearch}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Search
          </button>
          <button
            onClick={() => {
              setSearchQuery('')
              loadPatients()
            }}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Breadcrumb */}
      {renderBreadcrumb()}

      {/* Content */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        {loading ? (
          <div className="p-8">
            <LoadingSpinner size="lg" message="Loading..." />
          </div>
        ) : (
          <>
            {/* Patients Tab */}
            {activeTab === 'patients' && (
              <div>
                <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                    Patients ({patients.length})
                  </h3>
                </div>
                {patients.length === 0 ? (
                  <div className="p-8 text-center">
                    <p className="text-gray-500 dark:text-gray-400">
                      No patients found.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Patient
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Birth Date
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Sex
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Studies
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {patients.map((patient) => (
                          <tr key={patient.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                            <td className="px-4 py-3">
                              <div>
                                <div className="text-sm font-medium text-gray-900 dark:text-white">
                                  {patient.main_dicom_tags?.PatientName || 'Unknown'}
                                </div>
                                <div className="text-sm text-gray-500 dark:text-gray-400">
                                  ID: {patient.main_dicom_tags?.PatientID || 'N/A'}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                              {formatDate(patient.main_dicom_tags?.PatientBirthDate)}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                              {patient.main_dicom_tags?.PatientSex || 'N/A'}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                              {patient.studies?.length || 0}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center space-x-2">
                                <button
                                  onClick={() => loadStudies(patient.id)}
                                  className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium"
                                >
                                  View Studies
                                </button>
                                <PermissionGate permissions={['orthanc.delete']}>
                                  <button
                                    onClick={() => deleteResource('patient', patient.id)}
                                    className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-sm font-medium"
                                  >
                                    Delete
                                  </button>
                                </PermissionGate>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Studies Tab */}
            {activeTab === 'studies' && (
              <div>
                <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                    Studies ({studies.length})
                  </h3>
                </div>
                {studies.length === 0 ? (
                  <div className="p-8 text-center">
                    <p className="text-gray-500 dark:text-gray-400">
                      No studies found for this patient.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Study
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Date
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Modality
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Series
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {studies.map((study) => (
                          <tr key={study.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                            <td className="px-4 py-3">
                              <div>
                                <div className="text-sm font-medium text-gray-900 dark:text-white">
                                  {study.main_dicom_tags?.StudyDescription || 'Unknown Study'}
                                </div>
                                <div className="text-sm text-gray-500 dark:text-gray-400">
                                  ID: {study.main_dicom_tags?.StudyInstanceUID?.slice(-12) || 'N/A'}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                              {formatDate(study.main_dicom_tags?.StudyDate)}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                              {study.main_dicom_tags?.ModalitiesInStudy || 'N/A'}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                              {study.series?.length || 0}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center space-x-2">
                                <button
                                  onClick={() => loadSeries(study.id)}
                                  className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium"
                                >
                                  View Series
                                </button>
                                <PermissionGate permissions={['orthanc.delete']}>
                                  <button
                                    onClick={() => deleteResource('study', study.id)}
                                    className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-sm font-medium"
                                  >
                                    Delete
                                  </button>
                                </PermissionGate>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Series Tab */}
            {activeTab === 'series' && (
              <div>
                <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                    Series ({series.length})
                  </h3>
                </div>
                {series.length === 0 ? (
                  <div className="p-8 text-center">
                    <p className="text-gray-500 dark:text-gray-400">
                      No series found for this study.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Series
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Modality
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Instances
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {series.map((seriesItem) => (
                          <tr key={seriesItem.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                            <td className="px-4 py-3">
                              <div>
                                <div className="text-sm font-medium text-gray-900 dark:text-white">
                                  {seriesItem.main_dicom_tags?.SeriesDescription || 'Unknown Series'}
                                </div>
                                <div className="text-sm text-gray-500 dark:text-gray-400">
                                  Number: {seriesItem.main_dicom_tags?.SeriesNumber || 'N/A'}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                              {seriesItem.main_dicom_tags?.Modality || 'N/A'}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                              {seriesItem.instances?.length || 0}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center space-x-2">
                                <button
                                  onClick={() => loadInstances(seriesItem.id)}
                                  className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium"
                                >
                                  View Instances
                                </button>
                                <PermissionGate permissions={['orthanc.delete']}>
                                  <button
                                    onClick={() => deleteResource('series', seriesItem.id)}
                                    className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-sm font-medium"
                                  >
                                    Delete
                                  </button>
                                </PermissionGate>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Instances Tab */}
            {activeTab === 'instances' && (
              <div>
                <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                    Instances ({instances.length})
                  </h3>
                </div>
                {instances.length === 0 ? (
                  <div className="p-8 text-center">
                    <p className="text-gray-500 dark:text-gray-400">
                      No instances found for this series.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Instance
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Size
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Transfer Syntax
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {instances.map((instance) => (
                          <tr key={instance.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                            <td className="px-4 py-3">
                              <div>
                                <div className="text-sm font-medium text-gray-900 dark:text-white">
                                  Instance #{instance.main_dicom_tags?.InstanceNumber || 'N/A'}
                                </div>
                                <div className="text-sm text-gray-500 dark:text-gray-400 font-mono">
                                  {instance.id.slice(0, 8)}...
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                              {formatFileSize(instance.file_size)}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                              {instance.main_dicom_tags?.TransferSyntaxUID || 'N/A'}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center space-x-2">
                                <PermissionGate permissions={['orthanc.download']}>
                                  <button
                                    onClick={() => downloadDicom(instance.id, `instance_${instance.main_dicom_tags?.InstanceNumber || instance.id}.dcm`)}
                                    className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 text-sm font-medium"
                                  >
                                    Download
                                  </button>
                                </PermissionGate>
                                <PermissionGate permissions={['orthanc.delete']}>
                                  <button
                                    onClick={() => deleteResource('instance', instance.id)}
                                    className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-sm font-medium"
                                  >
                                    Delete
                                  </button>
                                </PermissionGate>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default Orthanc