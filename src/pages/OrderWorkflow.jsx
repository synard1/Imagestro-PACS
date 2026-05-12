import { useMemo, useState, useEffect } from 'react'
import ReactFlow, {
  Background,
  Controls,
  Handle,
  Position,
  BaseEdge,
  MarkerType,
  getSmoothStepPath,
} from 'reactflow'
import 'reactflow/dist/style.css'
import '../styles/workflow-flowchart.css'

const PROCESS_STEPS = [
  'order',
  'verify',
  'send_modality',
  'acquire',
  'receive_result',
  'validate',
  'archive',
  'report',
  'sync_external',
]

function ProcessNode({ data }) {
  const statusClass = data.isActive
    ? 'flow-node--active'
    : data.isDone
      ? 'flow-node--done'
      : 'flow-node--idle'

  return (
    <div className={`flow-node ${statusClass}`}>
      <Handle type="target" position={Position.Left} className="flow-handle" />
      <div className="flow-node__row">
        <span className={`flow-node__icon ${data.isActive ? 'flow-node__icon--moving' : ''}`}>
          {data.icon}
        </span>
        <div>
          <div className="flow-node__title">{data.title}</div>
          <div className="flow-node__desc">{data.description}</div>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="flow-handle" />
    </div>
  )
}

function DataTransferEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, data }) {
  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 10,
  })

  const edgeClassName = data?.isActive ? 'flow-edge flow-edge--active' : 'flow-edge'

  return <BaseEdge id={id} path={path} markerEnd={markerEnd} className={edgeClassName} />
}

const nodeTypes = {
  processNode: ProcessNode,
}

const edgeTypes = {
  dataTransfer: DataTransferEdge,
}

const BASE_NODES = [
  {
    id: 'order',
    type: 'processNode',
    position: { x: 20, y: 120 },
    data: {
      title: 'Order Masuk',
      description: 'Order radiologi diterima dari SIMRS/RIS',
      icon: '📝',
    },
  },
  {
    id: 'verify',
    type: 'processNode',
    position: { x: 320, y: 120 },
    data: {
      title: 'Validasi Order',
      description: 'Cek pasien, prosedur, dan metadata',
      icon: '✅',
    },
  },
  {
    id: 'send_modality',
    type: 'processNode',
    position: { x: 620, y: 120 },
    data: {
      title: 'Kirim ke Modalitas',
      description: 'Data dikirim ke worklist modalitas',
      icon: '📤',
    },
  },
  {
    id: 'acquire',
    type: 'processNode',
    position: { x: 920, y: 120 },
    data: {
      title: 'Pemeriksaan Modalitas',
      description: 'Modalitas melakukan akuisisi gambar',
      icon: '🩻',
    },
  },
  {
    id: 'receive_result',
    type: 'processNode',
    position: { x: 1220, y: 120 },
    data: {
      title: 'Terima Hasil Modalitas',
      description: 'DICOM diterima oleh PACS Gateway',
      icon: '📥',
    },
  },
  {
    id: 'validate',
    type: 'processNode',
    position: { x: 1520, y: 120 },
    data: {
      title: 'Validasi Hasil',
      description: 'Cek studi, accession, dan konsistensi data',
      icon: '🔎',
    },
  },
  {
    id: 'archive',
    type: 'processNode',
    position: { x: 1820, y: 120 },
    data: {
      title: 'Simpan ke PACS',
      description: 'Studi diarsipkan untuk viewing dan reporting',
      icon: '🗄️',
    },
  },
  {
    id: 'report',
    type: 'processNode',
    position: { x: 2120, y: 120 },
    data: {
      title: 'Pelaporan',
      description: 'Radiolog membuat dan sign report',
      icon: '🧾',
    },
  },
  {
    id: 'sync_external',
    type: 'processNode',
    position: { x: 2420, y: 120 },
    data: {
      title: 'Sinkronisasi Lanjutan',
      description: 'Kirim status/hasil ke SATUSEHAT atau sistem eksternal',
      icon: '🔁',
    },
  },
]

const BASE_EDGES = [
  ['order', 'verify'],
  ['verify', 'send_modality'],
  ['send_modality', 'acquire'],
  ['acquire', 'receive_result'],
  ['receive_result', 'validate'],
  ['validate', 'archive'],
  ['archive', 'report'],
  ['report', 'sync_external'],
].map(([source, target]) => ({
  id: `edge-${source}-${target}`,
  source,
  target,
  type: 'dataTransfer',
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 16,
    height: 16,
  },
  data: { isActive: false },
}))

export default function OrderWorkflow() {
  const [activeStep, setActiveStep] = useState(PROCESS_STEPS[0])

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveStep(prev => {
        const currentIndex = PROCESS_STEPS.indexOf(prev)
        const nextIndex = (currentIndex + 1) % PROCESS_STEPS.length
        return PROCESS_STEPS[nextIndex]
      })
    }, 1700)

    return () => clearInterval(timer)
  }, [])

  const activeIndex = PROCESS_STEPS.indexOf(activeStep)

  const nodes = useMemo(
    () =>
      BASE_NODES.map(node => {
        const nodeIndex = PROCESS_STEPS.indexOf(node.id)
        return {
          ...node,
          draggable: false,
          selectable: false,
          data: {
            ...node.data,
            isActive: node.id === activeStep,
            isDone: nodeIndex < activeIndex,
          },
        }
      }),
    [activeStep, activeIndex]
  )

  const edges = useMemo(
    () =>
      BASE_EDGES.map(edge => {
        const sourceIndex = PROCESS_STEPS.indexOf(edge.source)
        return {
          ...edge,
          animated: true,
          selectable: false,
          data: {
            isActive: sourceIndex === activeIndex,
          },
        }
      }),
    [activeIndex]
  )

  return (
    <div className="order-workflow-page">
      <div className="order-workflow-header">
        <h1>Flowchart Bisnis Proses Radiologi</h1>
        <p>
          Alur berjalan dari order masuk, kirim data ke modalitas, terima hasil modalitas,
          sampai arsip, pelaporan, dan sinkronisasi eksternal.
        </p>
      </div>

      <div className="order-workflow-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.45}
          maxZoom={1.3}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag
        >
          <Background gap={20} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  )
}
