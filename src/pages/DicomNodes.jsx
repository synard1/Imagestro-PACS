import { useEffect, useState } from 'react'
import { api } from '../services/api'

export default function DicomNodes() {
  const [rows, setRows] = useState([])
  useEffect(() => { api.listDicomNodes().then(setRows) }, [])

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">DICOM Nodes</h1>
      <div className="card overflow-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th><th>Type</th><th>AE Title</th><th>Host</th><th>Port</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(n => (
              <tr key={n.id}>
                <td>{n.name}</td>
                <td>{n.type}</td>
                <td className="font-mono text-xs">{n.ae_title}</td>
                <td>{n.host}</td>
                <td>{n.port}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
