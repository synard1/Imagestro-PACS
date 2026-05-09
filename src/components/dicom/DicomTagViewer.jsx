import { useState, useEffect } from 'react';
import { 
  MagnifyingGlassIcon, 
  PencilIcon,
  ArrowDownTrayIcon,
  XMarkIcon,
  CheckIcon
} from '@heroicons/react/24/outline';
import dicomParser from 'dicom-parser';

/**
 * DICOM Tag Viewer Component
 * Displays DICOM tags in a searchable table
 */
export default function DicomTagViewer({ 
  instanceId, 
  onClose, 
  editable = false,
  onSave 
}) {
  const [tags, setTags] = useState([]);
  const [filteredTags, setFilteredTags] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [editedTags, setEditedTags] = useState({});
  const [dataSet, setDataSet] = useState(null);

  // Load DICOM tags
  useEffect(() => {
    loadDicomTags();
  }, [instanceId]);

  // Filter tags based on search
  useEffect(() => {
    if (!searchQuery) {
      setFilteredTags(tags);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = tags.filter(tag => 
      tag.tag.toLowerCase().includes(query) ||
      tag.name.toLowerCase().includes(query) ||
      tag.value.toLowerCase().includes(query) ||
      tag.vr.toLowerCase().includes(query)
    );
    setFilteredTags(filtered);
  }, [searchQuery, tags]);

  const loadDicomTags = async () => {
    try {
      setLoading(true);
      
      // Get DICOM file from localStorage
      const { getFileByInstanceId } = await import('../../services/dicomStorageService');
      const fileData = getFileByInstanceId(instanceId);
      
      if (!fileData || !fileData.base64Data) {
        throw new Error('DICOM file not found');
      }

      // Convert base64 to ArrayBuffer
      const base64Data = fileData.base64Data.split(',')[1] || fileData.base64Data;
      const binaryString = window.atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Parse DICOM
      const parsedDataSet = dicomParser.parseDicom(bytes);
      setDataSet(parsedDataSet);

      // Extract tags
      const extractedTags = [];
      for (const propertyName in parsedDataSet.elements) {
        const element = parsedDataSet.elements[propertyName];
        const tag = propertyName;
        const tagGroup = tag.substring(1, 5);
        const tagElement = tag.substring(5, 9);
        const tagString = `(${tagGroup},${tagElement})`;
        
        let value = '';
        let vr = element.vr || 'UN';
        
        try {
          // Try to get string value
          if (element.length > 0 && element.length < 1024) {
            value = parsedDataSet.string(tag) || '';
          } else if (element.length >= 1024) {
            value = `[Binary Data: ${element.length} bytes]`;
          }
        } catch (e) {
          value = `[Cannot display: ${element.length} bytes]`;
        }

        extractedTags.push({
          tag: tagString,
          tagHex: tag,
          name: getTagName(tag),
          vr: vr,
          value: value,
          length: element.length,
          editable: isEditableTag(tag),
          vrMaxLength: getVRMaxLength(vr, tag)
        });
      }

      // Sort by tag
      extractedTags.sort((a, b) => a.tagHex.localeCompare(b.tagHex));
      
      setTags(extractedTags);
      setFilteredTags(extractedTags);
    } catch (error) {
      console.error('[DicomTagViewer] Error loading tags:', error);
      alert('Failed to load DICOM tags: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const getTagName = (tag) => {
    // Common DICOM tags
    const tagNames = {
      'x00080005': 'Specific Character Set',
      'x00080008': 'Image Type',
      'x00080016': 'SOP Class UID',
      'x00080018': 'SOP Instance UID',
      'x00080020': 'Study Date',
      'x00080030': 'Study Time',
      'x00080050': 'Accession Number',
      'x00080060': 'Modality',
      'x00080070': 'Manufacturer',
      'x00080090': 'Referring Physician Name',
      'x00081030': 'Study Description',
      'x0008103e': 'Series Description',
      'x00100010': 'Patient Name',
      'x00100020': 'Patient ID',
      'x00100030': 'Patient Birth Date',
      'x00100040': 'Patient Sex',
      'x0020000d': 'Study Instance UID',
      'x0020000e': 'Series Instance UID',
      'x00200010': 'Study ID',
      'x00200011': 'Series Number',
      'x00200013': 'Instance Number',
      'x00280002': 'Samples Per Pixel',
      'x00280004': 'Photometric Interpretation',
      'x00280010': 'Rows',
      'x00280011': 'Columns',
      'x00280030': 'Pixel Spacing',
      'x00280100': 'Bits Allocated',
      'x00280101': 'Bits Stored',
      'x00280102': 'High Bit',
      'x00280103': 'Pixel Representation',
      'x7fe00010': 'Pixel Data'
    };
    
    return tagNames[tag] || 'Unknown';
  };

  // Get DICOM VR max length based on standard and practical limits
  const getVRMaxLength = (vr, tag) => {
    // Tag-specific limits (based on AWS HealthImaging API and practical usage)
    const tagSpecificLimits = {
      'x00080050': 256,  // Accession Number (AWS: 256, DICOM standard: 16)
      'x00100010': 256,  // Patient Name (AWS: 256, DICOM standard: 64)
      'x00100020': 256,  // Patient ID (AWS: 256, DICOM standard: 64)
      'x00100030': 18,   // Patient Birth Date (AWS: 18, DICOM standard: 8)
      'x00100040': 16,   // Patient Sex (AWS: 16, DICOM standard: 16)
      'x00081030': 256,  // Study Description (AWS: 256, DICOM standard: 64)
      'x0008103e': 64,   // Series Description (DICOM standard: 64)
      'x00200010': 256,  // Study ID (AWS: 256, DICOM standard: 16)
      'x00080020': 18,   // Study Date (AWS: 18, DICOM standard: 8)
      'x00080030': 28,   // Study Time (AWS: 28, DICOM standard: 16)
      'x0020000d': 256,  // Study Instance UID (AWS: 256, DICOM standard: 64)
      'x0020000e': 256,  // Series Instance UID (AWS: 256, DICOM standard: 64)
      'x00080060': 16,   // Modality (AWS: 16, DICOM standard: 16)
    };
    
    // Check tag-specific limit first
    if (tagSpecificLimits[tag]) {
      return tagSpecificLimits[tag];
    }
    
    // DICOM VR max lengths (based on DICOM standard)
    const vrLimits = {
      'AE': 16,   // Application Entity
      'AS': 4,    // Age String
      'AT': 4,    // Attribute Tag
      'CS': 16,   // Code String
      'DA': 8,    // Date
      'DS': 16,   // Decimal String
      'DT': 26,   // Date Time
      'FL': 4,    // Floating Point Single
      'FD': 8,    // Floating Point Double
      'IS': 12,   // Integer String
      'LO': 64,   // Long String
      'LT': 10240, // Long Text
      'OB': -1,   // Other Byte
      'OD': -1,   // Other Double
      'OF': -1,   // Other Float
      'OL': -1,   // Other Long
      'OW': -1,   // Other Word
      'PN': 64,   // Person Name (per component group)
      'SH': 16,   // Short String
      'SL': 4,    // Signed Long
      'SQ': -1,   // Sequence
      'SS': 2,    // Signed Short
      'ST': 1024, // Short Text
      'TM': 16,   // Time (actually 14, but allow padding)
      'UC': -1,   // Unlimited Characters
      'UI': 64,   // Unique Identifier
      'UL': 4,    // Unsigned Long
      'UN': -1,   // Unknown
      'UR': -1,   // URI/URL
      'US': 2,    // Unsigned Short
      'UT': -1    // Unlimited Text
    };
    
    return vrLimits[vr] || -1; // -1 means unlimited or binary
  };

  const isEditableTag = (tag) => {
    // Only allow editing certain tags (not UIDs, not pixel data)
    const editableTags = [
      'x00100010', // Patient Name
      'x00100020', // Patient ID
      'x00100030', // Patient Birth Date
      'x00100040', // Patient Sex
      'x00080050', // Accession Number
      'x00081030', // Study Description
      'x0008103e', // Series Description
      'x00080090', // Referring Physician Name
      'x00200010'  // Study ID
    ];
    
    return editableTags.includes(tag);
  };

  const handleEditTag = (tag) => {
    if (!tag.editable) {
      alert('This tag cannot be edited');
      return;
    }
    
    const currentLength = tag.value.trim().length;
    const allocatedSpace = tag.length;
    const vrMaxLength = getVRMaxLength(tag.vr, tag.tagHex);
    
    // Determine effective max length
    const effectiveMaxLength = vrMaxLength > 0 ? Math.min(allocatedSpace, vrMaxLength) : allocatedSpace;
    
    const newValue = prompt(
      `Edit ${tag.name} (${tag.tag})\n\n` +
      `VR Type: ${tag.vr}\n` +
      `Practical max: ${vrMaxLength > 0 ? vrMaxLength : 'unlimited'} chars\n` +
      `Current: "${tag.value}" (${currentLength} chars)\n` +
      `Allocated space: ${allocatedSpace} bytes\n` +
      `Effective max: ${effectiveMaxLength} characters\n\n` +
      // `Note: Limits based on AWS HealthImaging and DICOM standards.\n` +
      `If value exceeds allocated space, use Export to create new file.`,
      tag.value
    );
    
    if (newValue !== null) {
      // Check against practical limit first
      if (vrMaxLength > 0 && newValue.length > vrMaxLength) {
        alert(
          `Value exceeds practical limit!\n\n` +
          `Tag: ${tag.name} (${tag.tag})\n` +
          `VR Type: ${tag.vr}\n` +
          `Practical Max: ${vrMaxLength} characters\n` +
          `Your value: ${newValue.length} characters\n\n` +
          `Please shorten the value.\n` +
          `Reference: AWS HealthImaging API limits`
        );
        return;
      }
      
      // Check against allocated space
      if (newValue.length > allocatedSpace) {
        const shouldExport = confirm(
          `Value too long for allocated space!\n\n` +
          `Allocated space: ${allocatedSpace} bytes\n` +
          `Your value: ${newValue.length} characters\n` +
          `Excess: ${newValue.length - allocatedSpace} characters\n\n` +
          `Options:\n` +
          `OK - Truncate to fit (${allocatedSpace} chars)\n` +
          `Cancel - Keep full value (must use Export, not Update)`
        );
        
        if (shouldExport) {
          // Truncate to allocated space
          const truncated = newValue.substring(0, allocatedSpace);
          setEditedTags(prev => ({
            ...prev,
            [tag.tagHex]: truncated
          }));
          setTags(prev => prev.map(t => 
            t.tagHex === tag.tagHex ? { ...t, value: truncated } : t
          ));
          alert(`Value truncated to: "${truncated}"`);
        } else {
          // Keep full value but mark as export-only
          setEditedTags(prev => ({
            ...prev,
            [tag.tagHex]: newValue,
            [`${tag.tagHex}_exportOnly`]: true
          }));
          setTags(prev => prev.map(t => 
            t.tagHex === tag.tagHex ? { ...t, value: newValue + ' [Export Only]' } : t
          ));
        }
        return;
      }
      
      // Value is valid
      setEditedTags(prev => ({
        ...prev,
        [tag.tagHex]: newValue
      }));
      
      // Update display
      setTags(prev => prev.map(t => 
        t.tagHex === tag.tagHex ? { ...t, value: newValue } : t
      ));
    }
  };

  const handleSave = async () => {
    if (Object.keys(editedTags).length === 0) {
      alert('No changes to save');
      return;
    }

    // Check if any tags are export-only
    const hasExportOnly = Object.keys(editedTags).some(key => key.endsWith('_exportOnly'));
    
    if (hasExportOnly) {
      alert(
        'Some values are too long for in-place update.\n\n' +
        'Please use "Export Modified DICOM" button instead.\n' +
        'This will create a new file with proper space allocation.'
      );
      return;
    }

    try {
      // Call parent save handler
      if (onSave) {
        await onSave(editedTags, dataSet);
      }
      
      setEditMode(false);
      setEditedTags({});
      alert('Changes saved successfully!\n\nNote: Refresh the page to see updated tags in the viewer.');
    } catch (error) {
      console.error('[DicomTagViewer] Error saving:', error);
      alert('Failed to save changes: ' + error.message);
    }
  };

  const handleExport = () => {
    // Export tags as JSON
    const exportData = {
      instanceId,
      tags: tags.map(t => ({
        tag: t.tag,
        name: t.name,
        vr: t.vr,
        value: t.value
      })),
      editedTags
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dicom-tags-${instanceId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportDicom = async () => {
    if (Object.keys(editedTags).length === 0) {
      alert('No changes to export');
      return;
    }

    try {
      const fileName = prompt('Enter filename for modified DICOM:', `modified-${instanceId}.dcm`);
      if (!fileName) return;

      const { exportDicomWithEditedTags } = await import('../../services/dicomTagService');
      await exportDicomWithEditedTags(instanceId, editedTags, dataSet, fileName);
      
      alert('Modified DICOM file exported successfully!');
    } catch (error) {
      console.error('[DicomTagViewer] Error exporting DICOM:', error);
      alert('Failed to export DICOM: ' + error.message);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <div className="text-gray-700">Loading DICOM tags...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">DICOM Tag Viewer</h2>
            <p className="text-sm text-gray-600 mt-1">
              {filteredTags.length} of {tags.length} tags
              {Object.keys(editedTags).length > 0 && (
                <span className="ml-2 text-orange-600">
                  ({Object.keys(editedTags).length} edited)
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Search and Actions */}
        <div className="p-4 border-b border-gray-200 flex items-center gap-4">
          <div className="flex-1 relative">
            <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search tags, names, or values..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          {editable && (
            <button
              onClick={() => setEditMode(!editMode)}
              className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
                editMode
                  ? 'bg-orange-600 text-white hover:bg-orange-700'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <PencilIcon className="h-5 w-5" />
              {editMode ? 'Exit Edit Mode' : 'Edit Mode'}
            </button>
          )}
          
          {editMode && Object.keys(editedTags).length > 0 && (
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
            >
              <CheckIcon className="h-5 w-5" />
              Save Changes
            </button>
          )}
          
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <ArrowDownTrayIcon className="h-5 w-5" />
            Export Tags JSON
          </button>
          
          {editMode && Object.keys(editedTags).length > 0 && (
            <button
              onClick={handleExportDicom}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2"
            >
              <ArrowDownTrayIcon className="h-5 w-5" />
              Export Modified DICOM
            </button>
          )}
        </div>

        {/* Tags Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tag
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  VR
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Value
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Length
                </th>
                {editMode && (
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredTags.map((tag, index) => (
                <tr 
                  key={index}
                  className={`hover:bg-gray-50 ${
                    editedTags[tag.tagHex] ? 'bg-orange-50' : ''
                  }`}
                >
                  <td className="px-4 py-3 text-sm font-mono text-gray-900">
                    {tag.tag}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {tag.name}
                  </td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-600">
                    {tag.vr}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 max-w-md truncate">
                    {tag.value}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {tag.length}
                    {tag.vrMaxLength > 0 && tag.vrMaxLength < tag.length && (
                      <span className="text-orange-600 text-xs ml-1">
                        (VR max: {tag.vrMaxLength})
                      </span>
                    )}
                  </td>
                  {editMode && (
                    <td className="px-4 py-3 text-sm">
                      {tag.editable ? (
                        <button
                          onClick={() => handleEditTag(tag)}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          Edit
                        </button>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <div className="text-sm text-gray-600">
            <strong>Note:</strong> Only certain tags can be edited (Patient info, Study/Series descriptions). 
            UIDs and pixel data cannot be modified.
          </div>
        </div>
      </div>
    </div>
  );
}
