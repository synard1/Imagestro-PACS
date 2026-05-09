import React, { useState, useEffect } from 'react';
import { Search, Filter, Eye, Download, Trash2, RefreshCw, Calendar } from 'lucide-react';

const ReceivedImages = () => {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterModality, setFilterModality] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Mock data
  const mockImages = [
    {
      id: 1,
      patient_name: 'John Doe',
      patient_id: '12345',
      study_date: '2025-11-17',
      study_time: '10:30:00',
      modality: 'CT',
      study_description: 'CT Brain without contrast',
      series_count: 3,
      instance_count: 150,
      received_at: new Date().toISOString()
    },
    {
      id: 2,
      patient_name: 'Jane Smith',
      patient_id: '67890',
      study_date: '2025-11-17',
      study_time: '11:15:00',
      modality: 'MR',
      study_description: 'MRI Brain with contrast',
      series_count: 5,
      instance_count: 320,
      received_at: new Date(Date.now() - 3600000).toISOString()
    },
    {
      id: 3,
      patient_name: 'Bob Johnson',
      patient_id: '11111',
      study_date: '2025-11-16',
      study_time: '14:20:00',
      modality: 'CR',
      study_description: 'Chest X-ray PA and Lateral',
      series_count: 2,
      instance_count: 2,
      received_at: new Date(Date.now() - 86400000).toISOString()
    }
  ];

  useEffect(() => {
    loadImages();
  }, []);

  const loadImages = async () => {
    setLoading(true);
    try {
      // TODO: Replace with actual API call
      // const response = await fetch('/api/dicom/storage/studies');
      // const data = await response.json();
      // setImages(data);
      
      setTimeout(() => {
        setImages(mockImages);
        setLoading(false);
      }, 500);
    } catch (error) {
      console.error('Failed to load images:', error);
      setImages(mockImages);
      setLoading(false);
    }
  };

  const filteredImages = images.filter(img => {
    const matchesSearch = 
      img.patient_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      img.patient_id.includes(searchTerm) ||
      img.study_description.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesModality = filterModality === 'all' || img.modality === filterModality;
    
    return matchesSearch && matchesModality;
  });

  const paginatedImages = filteredImages.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const totalPages = Math.ceil(filteredImages.length / itemsPerPage);

  const getModalityColor = (modality) => {
    const colors = {
      CT: 'bg-blue-100 text-blue-800',
      MR: 'bg-purple-100 text-purple-800',
      CR: 'bg-green-100 text-green-800',
      US: 'bg-yellow-100 text-yellow-800',
      XA: 'bg-red-100 text-red-800'
    };
    return colors[modality] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Received Images</h1>
        <p className="text-gray-600 mt-1">View and manage received DICOM studies</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Search */}
          <div className="md:col-span-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search by patient name, ID, or description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Modality Filter */}
          <div>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <select
                value={filterModality}
                onChange={(e) => setFilterModality(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Modalities</option>
                <option value="CT">CT</option>
                <option value="MR">MR</option>
                <option value="CR">CR</option>
                <option value="US">US</option>
                <option value="XA">XA</option>
              </select>
            </div>
          </div>
        </div>

        {/* Results Count */}
        <div className="mt-4 text-sm text-gray-600">
          Showing {paginatedImages.length} of {filteredImages.length} studies
        </div>
      </div>

      {/* Images Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Patient
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Study Date/Time
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Modality
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Description
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Images
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Received
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {paginatedImages.map((image) => (
              <tr key={image.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div>
                    <div className="text-sm font-medium text-gray-900">{image.patient_name}</div>
                    <div className="text-sm text-gray-500">ID: {image.patient_id}</div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-1 text-sm text-gray-900">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <span>{image.study_date}</span>
                  </div>
                  <div className="text-sm text-gray-500">{image.study_time}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getModalityColor(image.modality)}`}>
                    {image.modality}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm text-gray-900 max-w-xs truncate">
                    {image.study_description}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  <div>{image.series_count} series</div>
                  <div className="text-gray-500">{image.instance_count} images</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(image.received_at).toLocaleString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      className="text-blue-600 hover:text-blue-900"
                      title="View"
                    >
                      <Eye className="w-5 h-5" />
                    </button>
                    <button
                      className="text-green-600 hover:text-green-900"
                      title="Download"
                    >
                      <Download className="w-5 h-5" />
                    </button>
                    <button
                      className="text-red-600 hover:text-red-900"
                      title="Delete"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Page {currentPage} of {totalPages}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReceivedImages;
