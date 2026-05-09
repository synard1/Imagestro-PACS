import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Select2 from '../Select2';
import { api } from '../../services/api';

const SimulationPanel = ({ state, next, branch, resolve, reset, updateData }) => {
  const { currentStep, data, error } = state;
  const [resolveValue, setResolveValue] = useState('');
  const [patientInput, setPatientInput] = useState({
    id: '',
    mrn: '',
    patient_national_id: '',
    ihs_number: '',
    patient_name: '',
  });
  const [requestingDoctor, setRequestingDoctor] = useState({ id: '', name: '', ihs_number: '' });
  const [modality, setModality] = useState({ code: '', label: '' });
  const [polyclinic, setPolyclinic] = useState('IGD');
  const [procedures, setProcedures] = useState([
    { id: 'proc-1', name: 'CT Thorax', code: '', accession_number: 'ACC-' + Math.floor(Math.random() * 100000), status: 'scheduled' }
  ]);
  
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [queryProgress, setQueryProgress] = useState(0);

  const handlePatientSelect = useCallback(async (opt) => {
    console.log('[Panel] handlePatientSelect called:', opt);
    if (!opt) {
      setPatientInput({ id: '', mrn: '', patient_national_id: '', ihs_number: '', patient_name: '' });
      return;
    }
    
    // Use opt.meta directly as instructed (contains NIK/IHS from fixed backend)
    const updated = {
      ...(opt.meta || {}),
      id: opt.meta?.id || opt.value || '',
      patient_name: opt.meta?.patient_name || opt.meta?.name || opt.label || '',
      patient_national_id: opt.meta?.patient_national_id || opt.meta?.national_id || '',
      ihs_number: opt.meta?.ihs_number || opt.meta?.ihsNumber || '',
    };
    
    console.log('[Panel] Setting patientInput:', updated);
    setPatientInput(updated);
  }, []);

  const handleDoctorSelect = useCallback((opt) => {
    console.log('[Panel] handleDoctorSelect called:', opt);
    if (!opt) {
      setRequestingDoctor({ id: '', name: '', ihs_number: '' });
      return;
    }
    setRequestingDoctor({
      id: opt.meta?.id || opt.value || '',
      name: opt.meta?.name || opt.label || '',
      ihs_number: opt.meta?.ihs_number || opt.meta?.ihsNumber || '',
    });
  }, []);

  const handleModalitySelect = useCallback((opt) => {
    console.log('[Panel] handleModalitySelect called:', opt);
    setModality({
      code: opt?.value || opt?.meta?.code || '',
      label: opt?.label || ''
    });
  }, []);

  const handleProcedureSelect = useCallback((procId, opt) => {
    console.log('[Panel] handleProcedureSelect called:', procId, opt);
    setProcedures(prev => prev.map(p => 
      p.id === procId ? { ...p, name: opt?.label || '', code: opt?.meta?.code || opt?.value || '' } : p
    ));
  }, []);

  const makeProcedureHandler = (procId) => (opt) => {
    console.log('[Panel] makeProcedureHandler:', procId, opt);
    setProcedures(prev => prev.map(p => 
      p.id === procId ? { ...p, name: opt?.label || '', code: opt?.meta?.code || opt?.value || '' } : p
    ));
  };

  const simulateDatabaseQuery = async (message, duration = 2000) => {
    setIsLoading(true);
    setLoadingMessage(message);
    setQueryProgress(0);
    
    const steps = 5;
    const interval = duration / steps;
    
    for (let i = 0; i <= steps; i++) {
      await new Promise(resolve => setTimeout(resolve, interval));
      setQueryProgress((i / steps) * 100);
    }
    
    setIsLoading(false);
    setLoadingMessage('');
    setQueryProgress(0);
  };

  const addProcedure = () => {
    const newId = `proc-${procedures.length + 1}`;
    setProcedures([...procedures, { id: newId, name: '', accession_number: '', status: 'scheduled' }]);
  };

  const removeProcedure = (id) => {
    setProcedures(procedures.filter(p => p.id !== id));
  };

  const updateProcedure = (id, field, value) => {
    setProcedures(procedures.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  console.log('[Panel] Current state:', { patientInput, modality, polyclinic, procedures, currentStep });

  const handleBegin = async () => {
    updateData({ 
      patient: patientInput, 
      procedures,
      requestingDoctor,
      modality: modality.code,
      polyclinic
    });
    await simulateDatabaseQuery('💾 Initializing Simulation Data...');
    next();
  };

  const handleNext = async () => {
    if (currentStep === 'MWL_SYNC') {
      await simulateDatabaseQuery('📡 Formatting DICOM MWL items...');
    } else if (currentStep === 'DICOM_RECEIVE') {
      await simulateDatabaseQuery('📥 Receiving DICOM objects from Modality...');
    } else if (currentStep === 'MODALITY_ENTRY') {
      await simulateDatabaseQuery('⌨️ Petugas input data pasien manual ke Modalitas...');
    } else if (currentStep === 'DICOM_EXPORT') {
      await simulateDatabaseQuery('💾 Exporting DICOM files from Modality to local disk...');
    } else if (currentStep === 'PACS_UPLOAD') {
      await simulateDatabaseQuery('📤 Uploading DICOM files to Imagestro PACS...');
    } else if (currentStep === 'ORDER_COMPLETED') {
      await simulateDatabaseQuery('📝 Finalizing order state in RIS...');
    }
    next();
  };

  const handleBranch = async (result) => {
    if (currentStep === 'CHOOSE_INTEGRATION') {
      await simulateDatabaseQuery(`⚙️ Configuring integration mode: ${result === 'sync' ? 'Bridged Sync' : 'Manual Upload'}...`);
    } else if (currentStep === 'CHECK_ENCOUNTER') {
      await simulateDatabaseQuery(result ? '✅ Encounter Validated' : '❌ Encounter Invalid');
    } else if (currentStep === 'CHECK_SERVICE_REQUEST') {
      await simulateDatabaseQuery(result ? '✅ ServiceRequest Mapped' : '❌ ServiceRequest Unmapped');
    } else if (currentStep === 'CHECK_ACCESSION') {
      await simulateDatabaseQuery(result ? '✅ Accession Match' : '❌ Accession Mismatch');
    } else if (currentStep === 'SYNC_SATUSEHAT') {
      await simulateDatabaseQuery(result ? '📡 Syncing with SATUSEHAT...' : '⚠️ Sync failed, retrying...');
    }
    branch(result);
  };

  const handleResolve = async (newData) => {
    await simulateDatabaseQuery('🔄 Fixing simulation state...');
    resolve(newData);
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center h-64 space-y-4">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-lg font-bold text-gray-800 animate-pulse text-center">{loadingMessage}</p>
          <div className="w-full max-w-xs bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
              style={{ width: `${queryProgress}%` }}
            />
          </div>
        </div>
      );
    }

    switch (currentStep) {
      case 'ORDER_INPUT':
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-gray-800 border-b pb-2">1. Patient Search</h3>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase">Search Patient (Name/MRN/NIK)</label>
                <Select2 
                  fetchOptions={api.searchPatients}
                  fetchInitial={api.samplePatients}
                  onSelect={handlePatientSelect}
                  placeholder="Type patient name..."
                  className="mt-1"
                  initialLabel={patientInput.patient_name}
                />
              </div>

              <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded border border-dashed">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase">NIK</label>
                  <div className="text-xs font-mono font-bold text-gray-600 truncate">{patientInput.patient_national_id || patientInput.national_id || '-'}</div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase">IHS Number</label>
                  <div className="text-xs font-mono font-bold text-gray-600 truncate">{patientInput.ihs_number || '-'}</div>
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Full Name</label>
                  <div className="text-xs font-bold text-gray-800">{patientInput.patient_name || '-'}</div>
                </div>
              </div>
            </div>

            <h3 className="text-lg font-bold text-gray-800 border-b pb-2">2. Clinical Context</h3>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase">Requesting Doctor</label>
                <Select2 
                  fetchOptions={api.searchDoctors}
                  fetchInitial={api.sampleDoctors}
                  onSelect={handleDoctorSelect}
                  placeholder="Search doctor..."
                  className="mt-1"
                  initialLabel={requestingDoctor.name}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Polyclinic</label>
                  <select 
                    value={polyclinic}
                    onChange={(e) => {
                      console.log('[Panel] Polyclinic changed:', e.target.value);
                      setPolyclinic(e.target.value);
                    }}
                    className="w-full px-2 py-2 text-sm border rounded bg-white outline-none focus:ring-1 focus:ring-blue-500 mt-1"
                  >
                    <option value="IGD">IGD (Emergency)</option>
                    <option value="Rawat Inap">Rawat Inap (Inpatient)</option>
                    <option value="Poli Penyakit Dalam">Poli Penyakit Dalam</option>
                    <option value="Poli Anak">Poli Anak</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Target Modality</label>
                  <Select2 
                    fetchOptions={api.searchModalities}
                    fetchInitial={api.sampleModalities}
                    onSelect={handleModalitySelect}
                    placeholder="Select Modality..."
                    className="mt-1"
                    initialLabel={modality.label}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="text-lg font-bold text-gray-800">3. Procedures</h3>
              <button 
                onClick={addProcedure}
                className="text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 px-3 py-1 rounded-full border border-blue-200 font-black uppercase tracking-wider"
              >
                + Add Procedure
              </button>
            </div>

            <div className="space-y-4 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
              {procedures.map((proc, index) => {
                const handleProcSelect = (opt) => {
                  console.log('[Panel] handleProcSelect:', proc.id, opt);
                  setProcedures(prev => prev.map(p => 
                    p.id === proc.id ? { ...p, name: opt?.label || '', code: opt?.meta?.code || opt?.value || '' } : p
                  ));
                };
                return (
                <div key={proc.id} className="p-4 bg-gray-50 rounded-xl border border-gray-200 relative group transition-all hover:border-blue-300 hover:shadow-md">
                  <button 
                    onClick={() => removeProcedure(proc.id)}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 text-xs flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-10"
                  >
                    ×
                  </button>
                  <div className="space-y-3">
                    <div>
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Lookup Procedure</label>
                      <Select2 
                        fetchOptions={api.searchProcedures}
                        fetchInitial={api.sampleProcedures}
                        onSelect={handleProcSelect}
                        placeholder="Type to search procedure..."
                        className="mt-1"
                        initialLabel={proc.name}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Accession #</label>
                        <input 
                          type="text" 
                          value={proc.accession_number}
                          onChange={(e) => updateProcedure(proc.id, 'accession_number', e.target.value)}
                          className="w-full px-2 py-1.5 text-xs border rounded bg-white outline-none font-mono font-bold"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Status</label>
                        <select 
                          value={proc.status}
                          onChange={(e) => updateProcedure(proc.id, 'status', e.target.value)}
                          className="w-full px-2 py-1.5 text-xs border rounded bg-white outline-none font-bold"
                        >
                          <option value="scheduled">Scheduled</option>
                          <option value="in-progress">In Progress</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
                );
              })}
            </div>

            <button 
              onClick={handleBegin}
              disabled={!patientInput.patient_name || !modality.code || procedures.length === 0}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-black text-lg rounded-xl transition-all shadow-xl hover:shadow-blue-200 mt-4 active:scale-[0.98]"
            >
              CREATE SIMRS ORDER
            </button>
          </div>
        );

      case 'CHOOSE_INTEGRATION':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-gray-800">Choose Integration Type</h3>
            <p className="text-sm text-gray-600">Pilih metode integrasi antara SIMRS dan Modalitas/PACS.</p>
            <div className="flex flex-col gap-3">
              <button 
                onClick={() => handleBranch('sync')} 
                className="w-full p-4 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-xl text-left transition-all group"
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-blue-800 uppercase tracking-tight">⚡ BRIDGED SYNC</span>
                  <span className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded-full font-black uppercase">Automated</span>
                </div>
                <p className="text-[11px] text-blue-600 leading-tight">Data dikirim otomatis via DICOM Modality Worklist (MWL). Integrasi paling efisien.</p>
              </button>
              
              <button 
                onClick={() => handleBranch('manual')} 
                className="w-full p-4 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-xl text-left transition-all group"
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-amber-800 uppercase tracking-tight">📂 MANUAL UPLOAD</span>
                  <span className="text-[10px] bg-amber-600 text-white px-2 py-0.5 rounded-full font-black uppercase">Manual</span>
                </div>
                <p className="text-[11px] text-amber-600 leading-tight">Input manual ke alat, export ke disk, lalu upload manual ke PACS. Digunakan jika alat tidak support MWL.</p>
              </button>
            </div>
          </div>
        );

      case 'MWL_SYNC':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-gray-800">Modality (MWL Sync)</h3>
            <div className="p-4 bg-gray-900 text-green-400 font-mono text-[10px] rounded-lg border border-gray-700">
              <p># DICOM MWL Published</p>
              <p>Patient: {data.patient?.patient_name}</p>
              <p>NIK: {data.patient?.patient_national_id || data.patient?.national_id || '-'}</p>
              <p>Items: {data.procedures?.length}</p>
              <div className="mt-2 border-t border-gray-700 pt-2">
                {data.procedures?.map(p => (
                  <p key={p.id}>&gt; {p.name} [{p.accession_number}]</p>
                ))}
              </div>
            </div>
            <button 
              onClick={handleNext}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors"
            >
              Sync to Modality
            </button>
          </div>
        );

      case 'DICOM_RECEIVE':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-gray-800">DICOM Reception</h3>
            <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="animate-pulse bg-blue-600 w-2 h-2 rounded-full"></div>
              <p className="text-sm text-blue-800 font-medium">Listening for C-STORE operations...</p>
            </div>
            <button 
              onClick={handleNext}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors shadow-lg"
            >
              Complete Reception
            </button>
          </div>
        );

      case 'MODALITY_ENTRY':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-gray-800">Modality Entry</h3>
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-800 font-medium italic">"Petugas Radiologi sedang melakukan input manual data pasien ke konsol modalitas..."</p>
            </div>
            <button 
              onClick={handleNext}
              className="w-full py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg transition-colors shadow-lg"
            >
              Data Selesai Diinput
            </button>
          </div>
        );

      case 'DICOM_EXPORT':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-gray-800">DICOM Export</h3>
            <div className="p-4 bg-gray-100 border border-gray-300 rounded-lg">
              <p className="text-sm text-gray-700 font-medium italic">"Menyalin file DICOM dari modalitas ke media penyimpanan (Flashdisk/Local Disk)..."</p>
            </div>
            <button 
              onClick={handleNext}
              className="w-full py-3 bg-gray-600 hover:bg-gray-700 text-white font-bold rounded-lg transition-colors shadow-lg"
            >
              Export Berhasil
            </button>
          </div>
        );

      case 'PACS_UPLOAD':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-gray-800">PACS Upload</h3>
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800 font-medium italic">"Mengunggah file DICOM secara manual ke sistem Imagestro PACS..."</p>
            </div>
            <button 
              onClick={handleNext}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors shadow-lg"
            >
              Upload Selesai
            </button>
          </div>
        );

      case 'ORDER_COMPLETED':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-gray-800">Order Completion</h3>
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-800">Study received and order marked as <b>COMPLETED</b> in PACS.</p>
              <p className="text-[10px] text-green-600 mt-1 italic">Waiting for Regulatory Trigger...</p>
            </div>
            <button 
              onClick={handleNext}
              className="w-full py-4 bg-orange-600 hover:bg-orange-700 text-white font-black rounded-xl transition-all shadow-lg animate-pulse"
            >
              ⚡ TRIGGER REGULATORY CHECKS
            </button>
          </div>
        );

      case 'CHECK_ENCOUNTER':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-gray-800">Validate Encounter</h3>
            <p className="text-sm text-gray-600">Verifying active SIMRS encounter for SATUSEHAT requirements...</p>
            <div className="flex gap-2">
              <button onClick={() => handleBranch(true)} className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow-md transition-transform active:scale-95">Valid</button>
              <button onClick={() => handleBranch(false)} className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg shadow-md transition-transform active:scale-95">Invalid</button>
            </div>
          </div>
        );

      case 'ERROR_ENCOUNTER':
        return (
          <div className="space-y-4">
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <h3 className="text-lg font-bold text-red-800">Missing Encounter</h3>
              <p className="text-xs text-red-600 mt-2">No active encounter found. SATUSEHAT requires a clinical context for ImagingStudy.</p>
            </div>
            <button 
              onClick={() => handleResolve({ encounterId: 'ENC-' + Math.floor(Math.random()*1000) })}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-lg"
            >
              Simulate SIMRS Fix
            </button>
          </div>
        );

      case 'CHECK_SERVICE_REQUEST':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-gray-800">Validate ServiceRequest</h3>
            <p className="text-sm text-gray-600">Checking if procedures are correctly mapped to SIMRS ServiceRequest...</p>
            <div className="flex gap-2">
              <button onClick={() => handleBranch(true)} className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow-md transition-transform active:scale-95">Mapped</button>
              <button onClick={() => handleBranch(false)} className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg shadow-md transition-transform active:scale-95">Unmapped</button>
            </div>
          </div>
        );

      case 'ERROR_SERVICE_REQUEST':
        return (
          <div className="space-y-4">
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <h3 className="text-lg font-bold text-red-800">Unmapped ServiceRequest</h3>
              <p className="text-xs text-red-600 mt-2">Procedures in PACS do not have a corresponding ServiceRequest in SIMRS.</p>
            </div>
            <button 
              onClick={() => handleResolve({ serviceRequestId: 'SR-' + Math.floor(Math.random()*1000) })}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-lg"
            >
              Simulate SIMRS Fix
            </button>
          </div>
        );

      case 'CHECK_ACCESSION':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-gray-800">Reconcile Accession</h3>
            <p className="text-sm text-gray-600">Final check of Accession Number consistency between PACS and SIMRS...</p>
            <div className="flex gap-2">
              <button onClick={() => handleBranch(true)} className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow-md transition-transform active:scale-95">Match</button>
              <button onClick={() => handleBranch(false)} className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg shadow-md transition-transform active:scale-95">Mismatch</button>
            </div>
          </div>
        );

      case 'ERROR_ACCESSION':
        return (
          <div className="space-y-4">
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <h3 className="text-lg font-bold text-red-800">Accession Mismatch</h3>
              <p className="text-xs text-red-600 mt-2">The Accession Number provided by the Modality does not match the SIMRS record.</p>
            </div>
            <button 
              onClick={() => handleResolve({})}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-lg"
            >
              Simulate SIMRS Fix
            </button>
          </div>
        );

      case 'SYNC_SATUSEHAT':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-gray-800">SATUSEHAT Sync</h3>
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-xs text-green-800 font-bold mb-2">Broadcasting Resources:</p>
              <ul className="text-[10px] text-green-700 space-y-1">
                <li>✓ ImagingStudy: {data.procedures?.length} resources</li>
                <li>✓ Observation: Quality validation</li>
                <li>✓ DiagnosticReport: Final reference</li>
              </ul>
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleBranch(true)} className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow-lg transition-transform active:scale-95">Sync Success</button>
              <button onClick={() => handleBranch(false)} className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg shadow-lg transition-transform active:scale-95">Sync Fail</button>
            </div>
          </div>
        );
      case 'DONE':
        return (
          <div className="space-y-4 text-center py-8">
            <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-2xl font-black text-gray-800">Simulation Finished</h3>
            <p className="text-sm text-gray-500 max-w-[200px] mx-auto">All systems synchronized successfully to SATUSEHAT.</p>
            <button 
              onClick={reset}
              className="w-full py-3 border-2 border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white font-extrabold rounded-xl transition-all mt-6 shadow-md"
            >
              Restart Simulation
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="w-full h-full bg-white p-6 border-l shadow-2xl flex flex-col">
      <div className="mb-6 flex justify-between items-start">
        <div>
          <h2 className="text-xl font-black text-gray-800">
            CONTROLLER
          </h2>
          <div className="h-1.5 w-8 bg-blue-600 rounded-full" />
        </div>
        {error && (
          <div className="bg-red-100 text-red-600 text-[10px] font-bold px-2 py-1 rounded-full animate-bounce">
            ERROR ACTIVE
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {renderContent()}
      </div>

      <div className="mt-8 pt-6 border-t border-gray-100">
        <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Internal State</div>
        <div className="space-y-2">
<div className="flex justify-between items-center text-[11px] p-2 bg-gray-50 rounded border border-gray-100">
            <span className="text-gray-400 font-bold">CURRENT_STEP</span>
            <span className="font-mono text-blue-600 font-black px-2 bg-blue-50 rounded">{currentStep}</span>
          </div>
          <div className="flex justify-between items-center text-[11px] p-2 bg-gray-50 rounded border border-gray-100">
            <span className="text-gray-400 font-bold">PROCEDURES</span>
            <span className="font-mono text-gray-700 font-black">{procedures.length}</span>
          </div>
          <div className="flex justify-between items-center text-[11px] p-2 bg-gray-50 rounded border border-gray-100">
            <span className="text-gray-400 font-bold">PATIENT</span>
            <span className="font-mono text-gray-700 font-black truncate max-w-[100px]">{patientInput.patient_name || '-'}</span>
          </div>
          <div className="flex justify-between items-center text-[11px] p-2 bg-gray-50 rounded border border-gray-100">
            <span className="text-gray-400 font-bold">MODALITY</span>
            <span className="font-mono text-gray-700 font-black">{modality.code || '-'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SimulationPanel;
