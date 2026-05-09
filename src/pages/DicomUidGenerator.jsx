import React, { useState } from 'react';

const DicomUidGenerator = () => {
  const [currentUid, setCurrentUid] = useState('');
  const [uidHistory, setUidHistory] = useState([]);
  const [copied, setCopied] = useState(false);

  // Generate DICOM UID using UUID v4 approach with 2.25 root
  const generateDicomUid = () => {
    // Generate UUID v4
    const uuid = crypto.randomUUID();

    // Convert UUID to numeric string by removing dashes and converting hex to decimal
    const hexString = uuid.replace(/-/g, '');
    const decimal = BigInt('0x' + hexString).toString();

    // Combine with DICOM root 2.25 (UUID-based UIDs)
    const dicomUid = `2.25.${decimal}`;

    // Validate length (max 64 characters)
    if (dicomUid.length > 64) {
      // Fallback: use timestamp-based approach if UUID method exceeds limit
      const timestamp = Date.now();
      const random = Math.floor(Math.random() * 1000000000);
      return `2.25.${timestamp}${random}`;
    }

    return dicomUid;
  };

  const handleGenerate = () => {
    const newUid = generateDicomUid();
    setCurrentUid(newUid);
    setUidHistory(prev => [
      { uid: newUid, timestamp: new Date().toLocaleString() },
      ...prev.slice(0, 9) // Keep only last 10 UIDs
    ]);
    setCopied(false);
  };

  const handleCopy = (uid) => {
    navigator.clipboard.writeText(uid);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClearHistory = () => {
    setUidHistory([]);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">DICOM UID Generator</h1>
        <p className="text-gray-600">
          Generate unique DICOM UIDs following the DICOM standard (Part 5, Chapter 9)
        </p>
      </div>

      {/* Info Card */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <h2 className="text-lg font-semibold text-blue-900 mb-2">What is a DICOM UID?</h2>
        <p className="text-sm text-blue-800 mb-2">
          A DICOM Unique Identifier (UID) is a globally unique identifier used in medical imaging to identify
          DICOM objects, such as studies, series, instances, and transfer syntaxes.
        </p>
        <ul className="text-sm text-blue-800 list-disc list-inside space-y-1">
          <li>Format: Sequence of numeric components separated by dots (.)</li>
          <li>Maximum length: 64 characters</li>
          <li>Root: 2.25 (UUID-based UIDs as per DICOM standard)</li>
          <li>Each UID must be globally unique</li>
        </ul>
      </div>

      {/* Generator Section */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">Generate New UID</h2>

        <button
          onClick={handleGenerate}
          className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-medium px-8 py-3 rounded-lg transition-colors duration-200 mb-4"
        >
          Generate DICOM UID
        </button>

        {currentUid && (
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Generated UID:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={currentUid}
                readOnly
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 font-mono text-sm"
              />
              <button
                onClick={() => handleCopy(currentUid)}
                className={`px-6 py-2 rounded-lg font-medium transition-colors duration-200 ${
                  copied
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-600 hover:bg-gray-700 text-white'
                }`}
              >
                {copied ? '✓ Copied!' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Length: {currentUid.length} characters (max: 64)
            </p>
          </div>
        )}
      </div>

      {/* History Section */}
      {uidHistory.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-800">Generation History</h2>
            <button
              onClick={handleClearHistory}
              className="text-sm text-red-600 hover:text-red-700 font-medium"
            >
              Clear History
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Timestamp
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    DICOM UID
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {uidHistory.map((item, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                      {item.timestamp}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 font-mono">
                      {item.uid}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      <button
                        onClick={() => handleCopy(item.uid)}
                        className="text-blue-600 hover:text-blue-700 font-medium"
                      >
                        Copy
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Additional Info */}
      <div className="mt-6 bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-2">Technical Information</h3>
        <div className="text-xs text-gray-600 space-y-1">
          <p><strong>Generation Method:</strong> UUID v4 converted to decimal with 2.25 root prefix</p>
          <p><strong>Standard Reference:</strong> DICOM PS3.5 - Data Structures and Encoding</p>
          <p><strong>Root OID:</strong> 2.25 (UUID-based UIDs)</p>
          <p><strong>Uniqueness:</strong> Cryptographically random, globally unique</p>
        </div>
      </div>
    </div>
  );
};

export default DicomUidGenerator;
