import React from 'react';
import { useSimulationState } from './hooks/useSimulationState';
import SimulationFlow from './Flow/SimulationFlow';
import SimulationPanel from './SimulationPanel';

const SimulationApp = () => {
  const simulation = useSimulationState();
  const { state } = simulation;

  return (
    <div className="flex w-full h-screen bg-white">
      {/* Left Side: Visualization Flow */}
      <div className="flex-1 relative">
        <div className="absolute top-4 left-4 z-10">
          <h1 className="text-2xl font-black text-gray-800 tracking-tight">
            SIMRS <span className="text-blue-600">+</span> SATUSEHAT
          </h1>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Refined Life-cycle Simulation</p>
        </div>
        
        <SimulationFlow 
          currentStep={state.currentStep} 
          history={state.history} 
        />
        
        {/* Instruction Tooltip (Conditional) */}
        {(state.currentStep === 'GATE_PHASE_1' || state.currentStep === 'ERROR_PHASE_1') && (
          <div className="absolute top-20 right-20 z-20 bg-yellow-50 border-2 border-yellow-200 p-4 rounded-lg shadow-xl max-w-xs animate-pulse">
            <div className="flex items-start gap-3">
              <span className="text-2xl">💡</span>
              <p className="text-sm font-bold text-yellow-800">
                Gate Phase 1: We verify Encounter and ServiceRequest in SIMRS before publishing to MWL.
              </p>
            </div>
          </div>
        )}

        {state.currentStep === 'MODALITY_MWL' && (
          <div className="absolute bottom-40 right-20 z-20 bg-blue-50 border-2 border-blue-200 p-4 rounded-lg shadow-xl max-w-xs">
            <div className="flex items-start gap-3">
              <span className="text-2xl">📡</span>
              <p className="text-sm font-bold text-blue-800">
                MWL Published: The order is now available for the Modality to query via C-FIND.
              </p>
            </div>
          </div>
        )}

        {(state.currentStep === 'GATE_PHASE_2' || state.currentStep === 'ERROR_PHASE_2') && (
          <div className="absolute top-1/2 right-40 -translate-y-1/2 z-20 bg-purple-50 border-2 border-purple-200 p-4 rounded-lg shadow-xl max-w-xs">
            <div className="flex items-start gap-3">
              <span className="text-2xl">🆔</span>
              <p className="text-sm font-bold text-purple-800">
                Gate Phase 2: Reconciliation. Accession Number in DICOM must match the RIS order.
              </p>
            </div>
          </div>
        )}

        {state.currentStep === 'SATUSEHAT_SYNC' && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20 bg-green-50 border-2 border-green-200 p-4 rounded-lg shadow-xl max-w-md">
            <div className="flex items-start gap-3">
              <span className="text-2xl">🚀</span>
              <p className="text-sm font-bold text-green-800">
                Final Step: Synchronizing ImagingStudy resources to SATUSEHAT platform.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Right Side: Control Panel */}
      <div className="w-96 min-w-[384px]">
        <SimulationPanel {...simulation} />
      </div>
    </div>
  );
};

export default SimulationApp;
