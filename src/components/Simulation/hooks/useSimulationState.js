import { useReducer } from 'react';

const initialState = {
  currentStep: 'ORDER_INPUT',
  history: [],
  data: {
    patient: {
      patient_national_id: '',
      ihs_number: '',
      patient_name: '',
    },
    procedures: [],
    encounterId: '',
    serviceRequestId: '',
    integration_mode: 'sync', // 'sync' or 'manual'
  },
  error: null,
};

const reducer = (state, action) => {
  switch (action.type) {
    case 'NEXT': {
      const transitions = {
        'ORDER_INPUT': 'CHOOSE_INTEGRATION',
        // Path A (Sync)
        'MWL_SYNC': 'DICOM_RECEIVE',
        'DICOM_RECEIVE': 'ORDER_COMPLETED',
        // Path B (Manual)
        'MODALITY_ENTRY': 'DICOM_EXPORT',
        'DICOM_EXPORT': 'PACS_UPLOAD',
        'PACS_UPLOAD': 'ORDER_COMPLETED',
        // Rejoin
        'ORDER_COMPLETED': 'CHECK_ENCOUNTER',
      };
      
      const nextStep = transitions[state.currentStep];
      if (!nextStep) return state;

      return {
        ...state,
        currentStep: nextStep,
        history: [...state.history, state.currentStep],
        error: null,
      };
    }

    case 'BRANCH': {
      // Branching logic for decision nodes
      const branches = {
        'CHOOSE_INTEGRATION': action.payload === 'sync' ? 'MWL_SYNC' : 'MODALITY_ENTRY',
        'CHECK_ENCOUNTER': action.payload ? 'CHECK_SERVICE_REQUEST' : 'ERROR_ENCOUNTER',
        'CHECK_SERVICE_REQUEST': action.payload ? 'CHECK_ACCESSION' : 'ERROR_SERVICE_REQUEST',
        'CHECK_ACCESSION': action.payload ? 'SYNC_SATUSEHAT' : 'ERROR_ACCESSION',
        'SYNC_SATUSEHAT': action.payload ? 'DONE' : 'SYNC_SATUSEHAT', // Stay or retry
      };

      const nextStep = branches[state.currentStep];
      if (!nextStep) return state;

      // When branching at CHOOSE_INTEGRATION, we should ensure history is clean up to this point
      // (Currently the flow is linear enough that history is already clean)
      return {
        ...state,
        currentStep: nextStep,
        history: [...state.history, state.currentStep],
        error: (state.currentStep !== 'CHOOSE_INTEGRATION' && !action.payload) ? `Validation failed at ${state.currentStep}` : null,
        data: {
          ...state.data,
          integration_mode: state.currentStep === 'CHOOSE_INTEGRATION' ? action.payload : state.data.integration_mode
        }
      };
    }

    case 'RESOLVE_ERROR': {
      // Loop back to the validation step from error state
      const recovery = {
        'ERROR_ENCOUNTER': 'CHECK_ENCOUNTER',
        'ERROR_SERVICE_REQUEST': 'CHECK_SERVICE_REQUEST',
        'ERROR_ACCESSION': 'CHECK_ACCESSION',
      };

      const nextStep = recovery[state.currentStep];
      if (!nextStep) return state;

      return {
        ...state,
        currentStep: nextStep,
        history: [...state.history, state.currentStep],
        error: null,
        data: {
          ...state.data,
          ...action.payload,
        }
      };
    }

    case 'RESET':
      return initialState;

    case 'UPDATE_DATA':
      return {
        ...state,
        data: {
          ...state.data,
          ...action.payload,
        }
      };

    default:
      return state;
  }
};

export const useSimulationState = () => {
  const [state, dispatch] = useReducer(reducer, initialState);

  const next = () => dispatch({ type: 'NEXT' });
  const branch = (result) => dispatch({ type: 'BRANCH', payload: result });
  const resolve = (newData) => dispatch({ type: 'RESOLVE_ERROR', payload: newData });
  const reset = () => dispatch({ type: 'RESET' });
  const updateData = (data) => dispatch({ type: 'UPDATE_DATA', payload: data });

  return {
    state,
    next,
    branch,
    resolve,
    reset,
    updateData,
  };
};
