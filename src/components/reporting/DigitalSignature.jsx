import { useState, useRef } from 'react';
import { 
  PencilSquareIcon, 
  CheckCircleIcon,
  XMarkIcon,
  ShieldCheckIcon,
  QrCodeIcon,
  KeyIcon
} from '@heroicons/react/24/outline';
import SignatureCanvas from 'react-signature-canvas';
import { QRCodeSVG } from 'qrcode.react';

export default function DigitalSignature({ onSign, onCancel, reportStatus, study }) {
  const [signatureData, setSignatureData] = useState({
    name: 'Dr. Admin',
    credentials: 'MD, FRCR',
    licenseNumber: '#12345',
    password: '',
    agreed: false
  });
  const [signatureMethod, setSignatureMethod] = useState('password'); // password, pad, qrcode
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [qrVerified, setQrVerified] = useState(false);
  
  const signaturePadRef = useRef(null);

  const getQRCodeFormat = () => {
    // Get QR code format from environment variable
    // Default to 'text' if not set
    return import.meta.env.VITE_QR_CODE_FORMAT || 'text';
  };

  const getVerificationBaseUrl = () => {
    // Get base URL from env or use current origin
    return import.meta.env.VITE_VERIFICATION_BASE_URL || window.location.origin;
  };

  const generateQRDataURL = () => {
    // Generate URL format for QR code
    const hash = generateVerificationHash();
    const timestamp = new Date().getTime();
    const baseUrl = getVerificationBaseUrl();
    
    const verifyUrl = `${baseUrl}/verify-signature?` + 
      `hash=${hash}&` +
      `radiologist=${encodeURIComponent(signatureData.name)}&` +
      `license=${encodeURIComponent(signatureData.licenseNumber)}&` +
      `patient=${encodeURIComponent(study?.patientId || '')}&` +
      `study=${encodeURIComponent(study?.studyDate || '')}&` +
      `accession=${encodeURIComponent(study?.accessionNumber || '')}&` +
      `timestamp=${timestamp}`;
    
    return verifyUrl;
  };

  const generateQRDataText = () => {
    // Generate compact, scannable text format
    // Keep it short to ensure QR code is scannable
    const hash = generateVerificationHash();
    const timestamp = new Date().getTime();
    
    // Compact format - essential info only
    return `SIGNATURE VERIFIED
Dr: ${signatureData.name}
Lic: ${signatureData.licenseNumber}
Pt: ${study?.patientId || 'N/A'}
Date: ${study?.studyDate || 'N/A'}
Acc: ${study?.accessionNumber || 'N/A'}
Hash: ${hash}
Time: ${timestamp}
Status: ${reportStatus.toUpperCase()}`;
  };

  const generateQRData = () => {
    // Generate QR code data based on configured format
    const format = getQRCodeFormat();
    
    if (format === 'url') {
      return generateQRDataURL();
    } else {
      // Default to text format
      return generateQRDataText();
    }
  };

  const generateVerificationHash = () => {
    // Simple hash for demo - in production use proper cryptographic hash
    const data = `${signatureData.name}${signatureData.licenseNumber}${study?.patientId}${study?.studyDate}${new Date().toISOString()}`;
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
  };

  const clearSignaturePad = () => {
    if (signaturePadRef.current) {
      signaturePadRef.current.clear();
    }
  };

  const handleSign = () => {
    // Validate agreement
    if (!signatureData.agreed) {
      setError('You must agree to the terms before signing');
      return;
    }

    // Validate based on signature method
    if (signatureMethod === 'password') {
      if (!signatureData.password) {
        setError('Password is required to sign the report');
        return;
      }
      // In production, verify password with backend
      if (signatureData.password !== 'admin123') {
        setError('Invalid password');
        return;
      }
    } else if (signatureMethod === 'pad') {
      if (signaturePadRef.current && signaturePadRef.current.isEmpty()) {
        setError('Please provide your signature on the pad');
        return;
      }
    } else if (signatureMethod === 'qrcode') {
      if (!qrVerified) {
        setError('Please verify the QR code before signing');
        return;
      }
    }

    // Create signature object
    const signature = {
      name: signatureData.name,
      credentials: signatureData.credentials,
      licenseNumber: signatureData.licenseNumber,
      date: new Date().toISOString(),
      timestamp: new Date().getTime(),
      reportStatus: reportStatus,
      method: signatureMethod,
      verificationHash: generateVerificationHash()
    };

    // Add signature image if using pad
    if (signatureMethod === 'pad' && signaturePadRef.current) {
      signature.signatureImage = signaturePadRef.current.toDataURL();
    }

    // Add QR data if using QR code
    if (signatureMethod === 'qrcode') {
      signature.qrData = generateQRData();
    }

    onSign(signature);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <ShieldCheckIcon className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Digital Signature</h2>
                <p className="text-sm text-gray-500">Sign and finalize this report</p>
              </div>
            </div>
            <button
              onClick={onCancel}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <XMarkIcon className="h-5 w-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Body - Scrollable */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Radiologist Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <PencilSquareIcon className="h-5 w-5 text-blue-600 mt-0.5" />
              <div className="flex-1">
                <div className="font-semibold text-gray-900">{signatureData.name}</div>
                <div className="text-sm text-gray-600">{signatureData.credentials}</div>
                <div className="text-sm text-gray-600">License: {signatureData.licenseNumber}</div>
              </div>
            </div>
          </div>

          {/* Signature Method Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Signature Method <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-3 gap-3">
              {/* Password Method */}
              <button
                type="button"
                onClick={() => {
                  setSignatureMethod('password');
                  setError('');
                  setQrVerified(false);
                }}
                className={`p-4 border-2 rounded-lg transition-all ${
                  signatureMethod === 'password'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <KeyIcon className={`h-6 w-6 mx-auto mb-2 ${
                  signatureMethod === 'password' ? 'text-blue-600' : 'text-gray-400'
                }`} />
                <div className="text-sm font-medium text-gray-900">Password</div>
                <div className="text-xs text-gray-500 mt-1">Secure login</div>
              </button>

              {/* Signature Pad Method */}
              <button
                type="button"
                onClick={() => {
                  setSignatureMethod('pad');
                  setError('');
                  setQrVerified(false);
                }}
                className={`p-4 border-2 rounded-lg transition-all ${
                  signatureMethod === 'pad'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <PencilSquareIcon className={`h-6 w-6 mx-auto mb-2 ${
                  signatureMethod === 'pad' ? 'text-blue-600' : 'text-gray-400'
                }`} />
                <div className="text-sm font-medium text-gray-900">Sign Pad</div>
                <div className="text-xs text-gray-500 mt-1">Draw signature</div>
              </button>

              {/* QR Code Method */}
              <button
                type="button"
                onClick={() => {
                  setSignatureMethod('qrcode');
                  setError('');
                }}
                className={`p-4 border-2 rounded-lg transition-all ${
                  signatureMethod === 'qrcode'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <QrCodeIcon className={`h-6 w-6 mx-auto mb-2 ${
                  signatureMethod === 'qrcode' ? 'text-blue-600' : 'text-gray-400'
                }`} />
                <div className="text-sm font-medium text-gray-900">QR Code</div>
                <div className="text-xs text-gray-500 mt-1">Scan to verify</div>
              </button>
            </div>
          </div>

          {/* Password Input */}
          {signatureMethod === 'password' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={signatureData.password}
                  onChange={(e) => {
                    setSignatureData({ ...signatureData, password: e.target.value });
                    setError('');
                  }}
                  placeholder="Enter your password"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-blue-600 hover:text-blue-700"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
          )}

          {/* Signature Pad */}
          {signatureMethod === 'pad' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Draw Your Signature <span className="text-red-500">*</span>
              </label>
              <div className="border-2 border-gray-300 rounded-lg bg-white">
                <SignatureCanvas
                  ref={signaturePadRef}
                  canvasProps={{
                    className: 'w-full h-40 rounded-lg',
                    style: { touchAction: 'none' }
                  }}
                  backgroundColor="white"
                  penColor="black"
                />
              </div>
              <div className="flex justify-end mt-2">
                <button
                  type="button"
                  onClick={clearSignaturePad}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  Clear Signature
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Sign above using your mouse, touchpad, or touch screen
              </p>
            </div>
          )}

          {/* QR Code */}
          {signatureMethod === 'qrcode' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Verification QR Code
              </label>
              
              {/* Grid Layout: QR Code + Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* QR Code */}
                <div className="bg-white border-2 border-gray-300 rounded-lg p-4 flex flex-col items-center justify-center">
                  <QRCodeSVG
                    value={generateQRData()}
                    size={180}
                    level="H"
                    includeMargin={true}
                  />
                  <div className="mt-3 text-center">
                    <div className="text-xs font-medium text-gray-900">
                      Hash: {generateVerificationHash()}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Scan to verify
                    </div>
                  </div>
                </div>

                {/* Info */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="text-xs text-blue-900 space-y-2">
                    <div className="font-semibold flex items-center gap-1">
                      <span>📱</span>
                      <span>
                        {getQRCodeFormat() === 'url' ? 'Opens Page' : 'Shows Text'}
                      </span>
                    </div>
                    
                    {/* Format Badge */}
                    <div className={`px-2 py-1 rounded text-xs font-semibold inline-block ${
                      getQRCodeFormat() === 'url' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {getQRCodeFormat().toUpperCase()}
                    </div>

                    <div className="text-xs text-blue-700 mt-2">
                      <strong>Contains:</strong>
                    </div>
                    <div className="space-y-1 text-blue-800 text-xs">
                      <div>• Dr: {signatureData.name}</div>
                      <div>• Lic: {signatureData.licenseNumber}</div>
                      <div>• Pt: {study?.patientId}</div>
                      <div>• Date: {study?.studyDate}</div>
                      <div>• Acc: {study?.accessionNumber}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Alternative Format Toggle */}
              <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-3">
                <details className="text-xs">
                  <summary className="cursor-pointer font-medium text-gray-700 hover:text-gray-900">
                    {getQRCodeFormat() === 'url' 
                      ? 'View Text Format (alternative)'
                      : 'View URL Format (alternative)'}
                  </summary>
                  <div className="mt-2 bg-white p-2 rounded border border-gray-200">
                    {getQRCodeFormat() === 'url' ? (
                      <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono">
                        {generateQRDataText()}
                      </pre>
                    ) : (
                      <div className="text-xs text-gray-600 font-mono break-all">
                        {generateQRDataURL()}
                      </div>
                    )}
                  </div>
                  <div className="mt-2 text-xs text-gray-500">
                    To change format, update VITE_QR_CODE_FORMAT in .env file
                  </div>
                </details>
              </div>

              {/* Verification Checkbox */}
              <div className="mt-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={qrVerified}
                    onChange={(e) => {
                      setQrVerified(e.target.checked);
                      setError('');
                    }}
                    className="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-900">
                      I have verified the QR code information
                    </div>
                    <div className="text-xs text-gray-600 mt-1">
                      Confirm that all information in the QR code is correct
                    </div>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Agreement */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={signatureData.agreed}
                onChange={(e) => {
                  setSignatureData({ ...signatureData, agreed: e.target.checked });
                  setError('');
                }}
                className="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-900">
                  I certify that this report is accurate
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  By signing this report, I confirm that I have reviewed all images and findings, 
                  and that this report represents my professional medical opinion. This signature 
                  is legally binding and cannot be undone.
                </div>
              </div>
            </label>
          </div>

          {/* Warning */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <div className="flex gap-2">
              <div className="text-yellow-600 text-sm">⚠️</div>
              <div className="text-xs text-yellow-800">
                <strong>Important:</strong> Once signed, this report will be marked as FINAL 
                and cannot be edited. Make sure all information is correct before signing.
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSign}
            disabled={
              !signatureData.agreed ||
              (signatureMethod === 'password' && !signatureData.password) ||
              (signatureMethod === 'qrcode' && !qrVerified)
            }
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <CheckCircleIcon className="h-5 w-5" />
            Sign Report
          </button>
        </div>
      </div>
    </div>
  );
}
