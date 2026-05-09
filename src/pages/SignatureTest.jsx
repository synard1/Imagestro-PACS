/**
 * Signature Storage Test Page
 * Test signature creation, verification, and revocation
 */

import { useState } from 'react';
import { 
  createSignatureRecord, 
  verifySignature, 
  revokeSignatureRecord,
  exportSignatures,
  clearAllSignatures,
  syncToBackend,
  isBackendAvailable
} from '../services/signatureStorageService';

export default function SignatureTest() {
  const [testHash, setTestHash] = useState('TEST' + Math.random().toString(36).substr(2, 8).toUpperCase());
  const [result, setResult] = useState(null);
  const [signatures, setSignatures] = useState([]);
  const [backendStatus, setBackendStatus] = useState(null);

  const handleCreate = async () => {
    try {
      const result = await createSignatureRecord({
        reportId: 'test-report-' + Date.now(),
        signatureHash: testHash,
        radiologistId: 'test-doctor',
        radiologistName: 'Dr. Test',
        licenseNumber: '#TEST123',
        signatureMethod: 'password',
        signatureData: {
          test: true,
          timestamp: Date.now()
        }
      });
      setResult(result);
      refreshSignatures();
    } catch (error) {
      setResult({ error: error.message });
    }
  };

  const handleVerify = async () => {
    try {
      const result = await verifySignature(testHash);
      setResult(result);
    } catch (error) {
      setResult({ error: error.message });
    }
  };

  const handleRevoke = async () => {
    try {
      const result = await revokeSignatureRecord(
        testHash,
        'Dr. Test',
        'Testing revocation functionality'
      );
      setResult(result);
      refreshSignatures();
    } catch (error) {
      setResult({ error: error.message });
    }
  };

  const refreshSignatures = () => {
    const sigs = exportSignatures();
    setSignatures(sigs);
  };

  const handleClear = () => {
    if (window.confirm('Clear all signatures?')) {
      clearAllSignatures();
      refreshSignatures();
      setResult({ message: 'All signatures cleared' });
    }
  };

  const handleSync = async () => {
    try {
      const result = await syncToBackend();
      setResult(result);
    } catch (error) {
      setResult({ error: error.message });
    }
  };

  const checkBackend = async () => {
    const available = await isBackendAvailable();
    setBackendStatus(available);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          Signature Storage Test
        </h1>

        {/* Backend Status */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">Backend Status</h2>
          <button
            onClick={checkBackend}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Check Backend
          </button>
          {backendStatus !== null && (
            <div className={`mt-4 p-4 rounded ${backendStatus ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
              Backend: {backendStatus ? '✅ Available' : '❌ Not Available'}
            </div>
          )}
        </div>

        {/* Test Controls */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">Test Controls</h2>
          
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Test Signature Hash
            </label>
            <input
              type="text"
              value={testHash}
              onChange={(e) => setTestHash(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="Enter signature hash"
            />
          </div>

          <div className="flex gap-3 flex-wrap">
            <button
              onClick={handleCreate}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Create Signature
            </button>
            <button
              onClick={handleVerify}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Verify Signature
            </button>
            <button
              onClick={handleRevoke}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Revoke Signature
            </button>
            <button
              onClick={refreshSignatures}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              Refresh List
            </button>
            <button
              onClick={handleClear}
              className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700"
            >
              Clear All
            </button>
            <button
              onClick={handleSync}
              className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
            >
              Sync to Backend
            </button>
          </div>
        </div>

        {/* Result */}
        {result && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-bold mb-4">Result</h2>
            <pre className="bg-gray-50 p-4 rounded overflow-auto text-sm">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}

        {/* Signatures List */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">
            Stored Signatures ({signatures.length})
          </h2>
          
          {signatures.length === 0 ? (
            <p className="text-gray-500">No signatures stored</p>
          ) : (
            <div className="space-y-4">
              {signatures.map((sig) => (
                <div
                  key={sig.id}
                  className={`border-2 rounded-lg p-4 ${
                    sig.status === 'active' 
                      ? 'border-green-200 bg-green-50' 
                      : 'border-red-200 bg-red-50'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="font-bold text-lg">
                        {sig.signature_hash}
                      </div>
                      <div className="text-sm text-gray-600">
                        {sig.radiologist_name} ({sig.license_number})
                      </div>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-sm font-semibold ${
                      sig.status === 'active'
                        ? 'bg-green-200 text-green-800'
                        : 'bg-red-200 text-red-800'
                    }`}>
                      {sig.status.toUpperCase()}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-gray-600">Report ID:</span>{' '}
                      <span className="font-mono">{sig.report_id}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Method:</span>{' '}
                      {sig.signature_method}
                    </div>
                    <div>
                      <span className="text-gray-600">Signed:</span>{' '}
                      {new Date(sig.signed_at).toLocaleString()}
                    </div>
                    {sig.revoked_at && (
                      <div>
                        <span className="text-gray-600">Revoked:</span>{' '}
                        {new Date(sig.revoked_at).toLocaleString()}
                      </div>
                    )}
                  </div>

                  {sig.revocation_reason && (
                    <div className="mt-2 pt-2 border-t border-gray-200">
                      <span className="text-gray-600">Reason:</span>{' '}
                      {sig.revocation_reason}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
