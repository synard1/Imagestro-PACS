import React, { useMemo } from 'react';
import ReactFlow, { Background, Controls, MarkerType } from 'reactflow';
import 'reactflow/dist/style.css';
import StandardNode from './StandardNode';
import DiamondNode from './DiamondNode';

const nodeTypes = {
  standard: StandardNode,
  diamond: DiamondNode,
};

const ALL_NODES = [
  // Clinical Phase (y: 50 - 550)
  { id: 'ORDER_INPUT', type: 'standard', data: { label: 'Order Entry (SIMRS)', category: 'SIMRS' }, position: { x: 250, y: 50 }, draggable: false },
  { id: 'CHOOSE_INTEGRATION', type: 'diamond', data: { label: 'Choose Integration' }, position: { x: 275, y: 200 }, draggable: false },

  // Path A: Sync (x=250)
  { id: 'MWL_SYNC', type: 'standard', data: { label: 'Modality (MWL Sync)', category: 'PACS' }, position: { x: 250, y: 350 }, draggable: false },
  { id: 'DICOM_RECEIVE', type: 'standard', data: { label: 'Result (DICOM Receive)', category: 'PACS' }, position: { x: 250, y: 500 }, draggable: false },

  // Path B: Manual (x=500)
  { id: 'MODALITY_ENTRY', type: 'standard', data: { label: 'Modality Entry', category: 'MODALITY', isManual: true }, position: { x: 500, y: 350 }, draggable: false },
  { id: 'DICOM_EXPORT', type: 'standard', data: { label: 'DICOM Export', category: 'MODALITY', isManual: true }, position: { x: 500, y: 450 }, draggable: false },
  { id: 'PACS_UPLOAD', type: 'standard', data: { label: 'PACS Upload', category: 'PACS', isManual: true }, position: { x: 500, y: 550 }, draggable: false },

  { id: 'ORDER_COMPLETED', type: 'standard', data: { label: 'Order Completed', category: 'SIMRS' }, position: { x: 250, y: 650 }, draggable: false },

  // Regulatory Phase (starts at y: 800)
  { id: 'CHECK_ENCOUNTER', type: 'diamond', data: { label: 'Encounter Valid?' }, position: { x: 275, y: 800 }, draggable: false },
  { id: 'ERROR_ENCOUNTER', type: 'standard', data: { label: '⚠️ Missing Encounter', category: 'ERROR', isManual: true }, position: { x: 50, y: 800 }, draggable: false },
  
  { id: 'CHECK_SERVICE_REQUEST', type: 'diamond', data: { label: 'SR Mapped?' }, position: { x: 275, y: 950 }, draggable: false },
  { id: 'ERROR_SERVICE_REQUEST', type: 'standard', data: { label: '⚠️ Unmapped SR', category: 'ERROR', isManual: true }, position: { x: 50, y: 950 }, draggable: false },

  { id: 'CHECK_ACCESSION', type: 'diamond', data: { label: 'Accession Match?' }, position: { x: 275, y: 1100 }, draggable: false },
  { id: 'ERROR_ACCESSION', type: 'standard', data: { label: '⚠️ Accession Mismatch', category: 'ERROR', isManual: true }, position: { x: 50, y: 1100 }, draggable: false },

  { id: 'SYNC_SATUSEHAT', type: 'standard', data: { label: 'SATUSEHAT Sync', category: 'SIMRS' }, position: { x: 250, y: 1250 }, draggable: false },
  { id: 'DONE', type: 'standard', data: { label: 'Simulation Finished', category: 'INIT' }, position: { x: 250, y: 1400 }, draggable: false },
];

const SimulationFlow = ({ currentStep, history }) => {
  const revealedNodes = useMemo(() => {
    const nodes = [...history];
    if (currentStep) nodes.push(currentStep);
    return Array.from(new Set(nodes));
  }, [history, currentStep]);

  const nodes = useMemo(() => {
    return ALL_NODES
      .filter(node => revealedNodes.includes(node.id))
      .map(node => ({
        ...node,
        draggable: false,
        style: { visibility: 'visible' },
        data: {
          ...node.data,
          isActive: currentStep === node.id,
          isDone: history.includes(node.id),
          isRevealed: true,
        },
      }));
  }, [currentStep, history, revealedNodes]);

  const edges = useMemo(() => {
    const allEdges = [
      { id: 'e1-choose', source: 'ORDER_INPUT', target: 'CHOOSE_INTEGRATION', animated: currentStep === 'ORDER_INPUT' },
      
      // Path A: Sync
      { 
        id: 'e-choose-sync', 
        source: 'CHOOSE_INTEGRATION', 
        sourceHandle: 'yes', 
        target: 'MWL_SYNC', 
        label: 'Bridged Sync', 
        markerEnd: { type: MarkerType.ArrowClosed },
        animated: currentStep === 'CHOOSE_INTEGRATION'
      },
      { id: 'e-sync-receive', source: 'MWL_SYNC', target: 'DICOM_RECEIVE', animated: currentStep === 'MWL_SYNC' },
      { id: 'e-receive-complete', source: 'DICOM_RECEIVE', target: 'ORDER_COMPLETED', animated: currentStep === 'DICOM_RECEIVE' },

      // Path B: Manual
      { 
        id: 'e-choose-manual', 
        source: 'CHOOSE_INTEGRATION', 
        sourceHandle: 'no', 
        target: 'MODALITY_ENTRY', 
        label: 'Manual Upload', 
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: '#f59e0b' },
        animated: currentStep === 'CHOOSE_INTEGRATION'
      },
      { id: 'e-entry-export', source: 'MODALITY_ENTRY', target: 'DICOM_EXPORT', animated: currentStep === 'MODALITY_ENTRY' },
      { id: 'e-export-upload', source: 'DICOM_EXPORT', target: 'PACS_UPLOAD', animated: currentStep === 'DICOM_EXPORT' },
      { id: 'e-upload-complete', source: 'PACS_UPLOAD', target: 'ORDER_COMPLETED', animated: currentStep === 'PACS_UPLOAD' },

      { id: 'e-complete-check', source: 'ORDER_COMPLETED', target: 'CHECK_ENCOUNTER', animated: currentStep === 'ORDER_COMPLETED' },
      
      // Encounter branch
      { 
        id: 'e5-6', 
        source: 'CHECK_ENCOUNTER', 
        sourceHandle: 'yes', 
        target: 'CHECK_SERVICE_REQUEST', 
        label: 'Yes', 
        markerEnd: { type: MarkerType.ArrowClosed },
        animated: currentStep === 'CHECK_ENCOUNTER' 
      },
      { 
        id: 'e5-error', 
        source: 'CHECK_ENCOUNTER', 
        sourceHandle: 'no', 
        target: 'ERROR_ENCOUNTER', 
        label: 'No', 
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: '#f59e0b' }
      },
      { id: 'e-error-enc-resolve', source: 'ERROR_ENCOUNTER', target: 'CHECK_ENCOUNTER', style: { strokeDasharray: '5 5' } },

      // SR branch
      { 
        id: 'e6-7', 
        source: 'CHECK_SERVICE_REQUEST', 
        sourceHandle: 'yes', 
        target: 'CHECK_ACCESSION', 
        label: 'Yes', 
        markerEnd: { type: MarkerType.ArrowClosed },
        animated: currentStep === 'CHECK_SERVICE_REQUEST' 
      },
      { 
        id: 'e6-error', 
        source: 'CHECK_SERVICE_REQUEST', 
        sourceHandle: 'no', 
        target: 'ERROR_SERVICE_REQUEST', 
        label: 'No', 
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: '#f59e0b' }
      },
      { id: 'e-error-sr-resolve', source: 'ERROR_SERVICE_REQUEST', target: 'CHECK_SERVICE_REQUEST', style: { strokeDasharray: '5 5' } },

      // Accession branch
      { 
        id: 'e7-8', 
        source: 'CHECK_ACCESSION', 
        sourceHandle: 'yes', 
        target: 'SYNC_SATUSEHAT', 
        label: 'Yes', 
        markerEnd: { type: MarkerType.ArrowClosed },
        animated: currentStep === 'CHECK_ACCESSION' 
      },
      { 
        id: 'e7-error', 
        source: 'CHECK_ACCESSION', 
        sourceHandle: 'no', 
        target: 'ERROR_ACCESSION', 
        label: 'No', 
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: '#f59e0b' }
      },
      { id: 'e-error-acc-resolve', source: 'ERROR_ACCESSION', target: 'CHECK_ACCESSION', style: { strokeDasharray: '5 5' } },

      { id: 'e8-9', source: 'SYNC_SATUSEHAT', target: 'DONE', animated: currentStep === 'SYNC_SATUSEHAT' },
    ];

    return allEdges.filter(e => revealedNodes.includes(e.source) && revealedNodes.includes(e.target));
  }, [currentStep, revealedNodes]);

  return (
    <div className="w-full h-full bg-gray-50 border rounded-xl overflow-hidden shadow-inner">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
      >
        <Background color="#aaa" gap={16} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
};

export default SimulationFlow;
