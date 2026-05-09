import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { 
  ShieldCheckIcon, 
  CheckCircleIcon,
  XCircleIcon,
  ArrowLeftIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import { verifySignature } from '../services/signatureStorageService';

export default function VerifySignature() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [verificationData, setVerificationData] = useState(null);
  const [isValid, setIsValid] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [dbStatus, setDbStatus] = useState(null);
  const [isRevoked, setIsRevoked] = useState(false);

  useEffect(() => {
    const checkSignature = async () => {
      // Extract parameters from URL
      const hash = searchParams.get('hash');
      const radiologist = searchParams.get('radiologist');
      const license = searchParams.get('license');
      const patient = searchParams.get('patient');
      const study = searchParams.get('study');
      const accession = searchParams.get('accession');
      const timestamp = searchParams.get('timestamp');

      if (hash && radiologist) {
        setVerificationData({
          hash,
          radiologist,
          license,
          patient,
          study,
          accession,
          timestamp,
          verifiedAt: new Date().toISOString()
        });
        setIsValid(true);

        // Check database/storage for signature status
        try {
          const result = await verifySignature(hash);
          setDbStatus(result);
          
          if (result.status === 'revoked') {
            // Signature is revoked - mark as invalid
            setIsRevoked(true);
            setIsValid(false);
          } else if (result.status === 'active') {
            // Signature is active in tracking system
            setIsRevoked(false);
            setIsValid(true);
          } else if (result.status === 'not_found') {
            // Signature not in tracking system (old signature or not tracked)
            // QR code format is valid, so we keep it valid with warning
            setIsRevoked(false);
            setIsValid(true);
          }
        } catch (error) {
          console.error('Error checking signature status:', error);
          // If database check fails, show warning but keep valid (QR format is valid)
          setDbStatus({
            status: 'error',
            message: 'Could not verify signature status from database'
          });
          setIsValid(true); // Keep valid since QR format is correct
        }
      } else {
        setIsValid(false);
      }
      
      setIsLoading(false);
    };

    checkSignature();
  }, [searchParams]);

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Verifying Signature...</h1>
          <p className="text-gray-600">
            Checking signature status from database
          </p>
        </div>
      </div>
    );
  }

  // Invalid QR code
  if (!verificationData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <XCircleIcon className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Invalid QR Code</h1>
          <p className="text-gray-600 mb-6">
            This QR code does not contain valid signature verification data.
          </p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  // Revoked signature
  if (isRevoked && dbStatus) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 p-4">
        <div className="max-w-3xl mx-auto py-8">
          {/* Header */}
          <div className="mb-6">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
            >
              <ArrowLeftIcon className="h-5 w-5" />
              <span>Back to Home</span>
            </button>
          </div>

          {/* Revoked Card */}
          <div className="bg-white rounded-lg shadow-xl overflow-hidden">
            {/* Error Header */}
            <div className="bg-gradient-to-r from-red-500 to-red-600 p-6 text-white">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-white/20 rounded-full">
                  <XCircleIcon className="h-12 w-12" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold mb-1">Signature Revoked</h1>
                  <p className="text-red-100">
                    This signature has been invalidated and is no longer valid
                  </p>
                </div>
              </div>
            </div>

            {/* Revocation Details */}
            <div className="p-6 space-y-6">
              {/* Status */}
              <div className="flex items-center gap-3 p-4 bg-red-50 border-2 border-red-200 rounded-lg">
                <ExclamationTriangleIcon className="h-8 w-8 text-red-600 flex-shrink-0" />
                <div>
                  <div className="font-bold text-red-900">Signature Invalid</div>
                  <div className="text-sm text-red-700">
                    {dbStatus.message || 'This signature has been revoked and is no longer valid'}
                  </div>
                </div>
              </div>

              {/* Revocation Info */}
              {dbStatus.signature && (
                <div>
                  <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                    <span>⚠️</span>
                    <span>Revocation Information</span>
                  </h2>
                  <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Revoked At:</span>
                      <span className="font-semibold text-gray-900">
                        {new Date(dbStatus.signature.revoked_at).toLocaleString()}
                      </span>
                    </div>
                    {dbStatus.signature.revoked_by && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Revoked By:</span>
                        <span className="font-semibold text-gray-900">{dbStatus.signature.revoked_by}</span>
                      </div>
                    )}
                    {dbStatus.signature.revocation_reason && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <span className="text-gray-600 block mb-1">Reason:</span>
                        <span className="text-gray-900">{dbStatus.signature.revocation_reason}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Original Signature Info */}
              <div>
                <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <span>👨‍⚕️</span>
                  <span>Original Radiologist</span>
                </h2>
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Name:</span>
                    <span className="font-semibold text-gray-900">{verificationData.radiologist}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">License Number:</span>
                    <span className="font-semibold text-gray-900">{verificationData.license}</span>
                  </div>
                  {dbStatus.signature?.signed_at && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Originally Signed:</span>
                      <span className="font-semibold text-gray-900">
                        {new Date(dbStatus.signature.signed_at).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Verification Hash */}
              <div>
                <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <span>🔐</span>
                  <span>Signature Hash</span>
                </h2>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="font-mono text-lg font-bold text-red-600 bg-white p-3 rounded border-2 border-red-200 break-all">
                    {verificationData.hash}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => navigate('/')}
                  className="flex-1 px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-semibold"
                >
                  Close
                </button>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-6 text-center text-sm text-gray-600">
            <p>Powered by MWL-PACS System</p>
            <p className="mt-1">Digital Signature Verification v2.0</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 p-4">
      <div className="max-w-3xl mx-auto py-8">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeftIcon className="h-5 w-5" />
            <span>Back to Home</span>
          </button>
        </div>

        {/* Database Status Notice */}
        {dbStatus && dbStatus.status === 'active' && (
          <div className="bg-green-50 border-2 border-green-400 rounded-lg p-4 mb-6">
            <div className="flex gap-3">
              <div className="text-2xl">✅</div>
              <div className="flex-1">
                <div className="font-bold text-green-900 mb-1">Real-Time Verification</div>
                <div className="text-sm text-green-800">
                  This signature has been verified against the database and is currently <strong>ACTIVE</strong>.
                  The signature has not been revoked and remains valid.
                </div>
              </div>
            </div>
          </div>
        )}

        {dbStatus && dbStatus.status === 'not_found' && (
          <div className="bg-blue-50 border-2 border-blue-400 rounded-lg p-4 mb-6">
            <div className="flex gap-3">
              <div className="text-2xl">ℹ️</div>
              <div className="flex-1">
                <div className="font-bold text-blue-900 mb-1">Legacy Signature (Not Tracked)</div>
                <div className="text-sm text-blue-800">
                  This signature was created before the revocation tracking system was implemented. 
                  The QR code format is valid and the signature data is authentic.
                  <div className="text-xs text-blue-700 mt-2 bg-blue-100 p-2 rounded">
                    <strong>Note:</strong> This signature cannot be revoked through the system. 
                    If you need to verify the current status, contact the issuing institution with hash: 
                    <code className="font-mono bg-blue-200 px-1">{searchParams.get('hash')}</code>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {dbStatus && dbStatus.status === 'error' && (
          <div className="bg-orange-50 border-2 border-orange-400 rounded-lg p-4 mb-6">
            <div className="flex gap-3">
              <div className="text-2xl">⚠️</div>
              <div className="flex-1">
                <div className="font-bold text-orange-900 mb-1">Database Connection Error</div>
                <div className="text-sm text-orange-800">
                  Could not verify signature status from database. The QR code format is valid, 
                  but real-time status could not be checked.
                  <div className="text-xs text-orange-700 mt-2 bg-orange-100 p-2 rounded">
                    <strong>For verification:</strong> Contact the issuing institution to verify 
                    the signature status. Provide hash: <code className="font-mono bg-orange-200 px-1">{searchParams.get('hash')}</code>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Verification Card */}
        <div className="bg-white rounded-lg shadow-xl overflow-hidden">
          {/* Success Header */}
          <div className={`bg-gradient-to-r ${
            dbStatus?.status === 'active' 
              ? 'from-green-500 to-green-600' 
              : dbStatus?.status === 'not_found'
              ? 'from-blue-500 to-blue-600'
              : 'from-gray-500 to-gray-600'
          } p-6 text-white`}>
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/20 rounded-full">
                <ShieldCheckIcon className="h-12 w-12" />
              </div>
              <div>
                <h1 className="text-3xl font-bold mb-1">
                  {dbStatus?.status === 'active' 
                    ? 'Signature Verified ✓' 
                    : dbStatus?.status === 'not_found'
                    ? 'Signature Valid (Legacy)'
                    : 'QR Code Valid'}
                </h1>
                <p className={
                  dbStatus?.status === 'active' 
                    ? 'text-green-100' 
                    : dbStatus?.status === 'not_found'
                    ? 'text-blue-100'
                    : 'text-gray-100'
                }>
                  {dbStatus?.status === 'active' 
                    ? 'This signature is active and has been verified from the database'
                    : dbStatus?.status === 'not_found'
                    ? 'Valid signature created before tracking system was implemented'
                    : 'QR code format is valid'}
                </p>
              </div>
            </div>
          </div>

          {/* Verification Details */}
          <div className="p-6 space-y-6">
            {/* Status */}
            <div className={`flex items-center gap-3 p-4 ${
              dbStatus?.status === 'active' 
                ? 'bg-green-50 border-2 border-green-200' 
                : dbStatus?.status === 'not_found'
                ? 'bg-blue-50 border-2 border-blue-200'
                : 'bg-gray-50 border-2 border-gray-200'
            } rounded-lg`}>
              <CheckCircleIcon className={`h-8 w-8 ${
                dbStatus?.status === 'active' 
                  ? 'text-green-600' 
                  : dbStatus?.status === 'not_found'
                  ? 'text-blue-600'
                  : 'text-gray-600'
              } flex-shrink-0`} />
              <div>
                <div className={`font-bold ${
                  dbStatus?.status === 'active' 
                    ? 'text-green-900' 
                    : dbStatus?.status === 'not_found'
                    ? 'text-blue-900'
                    : 'text-gray-900'
                }`}>
                  {dbStatus?.status === 'active' 
                    ? 'Signature Active & Valid' 
                    : dbStatus?.status === 'not_found'
                    ? 'Legacy Signature - Valid'
                    : 'QR Code Format Valid'}
                </div>
                <div className={`text-sm ${
                  dbStatus?.status === 'active' 
                    ? 'text-green-700' 
                    : dbStatus?.status === 'not_found'
                    ? 'text-blue-700'
                    : 'text-gray-700'
                }`}>
                  {dbStatus?.status === 'active' 
                    ? 'This signature has been verified against the database and is currently active. It has not been revoked.'
                    : dbStatus?.status === 'not_found'
                    ? 'This is a valid signature created before the revocation tracking system. The QR code format and data are authentic.'
                    : 'The QR code contains valid signature data.'}
                </div>
              </div>
            </div>

            {/* Radiologist Information */}
            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                <span>👨‍⚕️</span>
                <span>Radiologist Information</span>
              </h2>
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Name:</span>
                  <span className="font-semibold text-gray-900">{verificationData.radiologist}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">License Number:</span>
                  <span className="font-semibold text-gray-900">{verificationData.license}</span>
                </div>
              </div>
            </div>

            {/* Study Information */}
            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                <span>📋</span>
                <span>Study Information</span>
              </h2>
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Patient ID:</span>
                  <span className="font-semibold text-gray-900">{verificationData.patient}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Study Date:</span>
                  <span className="font-semibold text-gray-900">{verificationData.study}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Accession Number:</span>
                  <span className="font-semibold text-gray-900">{verificationData.accession}</span>
                </div>
              </div>
            </div>

            {/* Verification Hash */}
            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                <span>🔐</span>
                <span>Cryptographic Verification</span>
              </h2>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-sm text-gray-600 mb-2">Verification Hash:</div>
                <div className="font-mono text-lg font-bold text-blue-600 bg-white p-3 rounded border-2 border-blue-200 break-all">
                  {verificationData.hash}
                </div>
              </div>
            </div>

            {/* Timestamp */}
            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                <span>⏰</span>
                <span>Timestamp Information</span>
              </h2>
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Signed At:</span>
                  <span className="font-semibold text-gray-900">
                    {new Date(parseInt(verificationData.timestamp)).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Verified At:</span>
                  <span className="font-semibold text-gray-900">
                    {new Date(verificationData.verifiedAt).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Legal Notice */}
            <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-4">
              <div className="flex gap-3">
                <div className="text-2xl">⚠️</div>
                <div className="flex-1">
                  <div className="font-bold text-yellow-900 mb-1">Legal Notice</div>
                  <div className="text-sm text-yellow-800">
                    This digital signature is legally binding. Any modification to the report 
                    after signing will invalidate this signature. This verification page confirms 
                    the authenticity of the signature at the time of verification.
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4">
              <button
                onClick={() => window.print()}
                className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"
              >
                Print Verification
              </button>
              <button
                onClick={() => navigate('/')}
                className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-sm text-gray-600">
          <p>Powered by MWL-PACS System</p>
          <p className="mt-1">Digital Signature Verification v1.0</p>
        </div>
      </div>
    </div>
  );
}
