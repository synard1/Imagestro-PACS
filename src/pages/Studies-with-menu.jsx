// Storage indicator component
const StorageIndicator = ({ storageType, className = "" }) => {
  const storageInfo = {
    browser: {
      text: 'Browser Storage',
      icon: '💾',
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
      description: 'Data stored locally in browser localStorage'
    },
    server: {
      text: 'Server Storage',
      icon: '📡',
      color: 'text-green-600',
      bgColor: 'bg-green-100',
      description: 'Data stored on remote server with synchronization'
    },
    external: {
      text: 'External API',
      icon: '☁️',
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
      description: 'Data retrieved from external backend API'
    }
  };

  const info = storageInfo[storageType] || storageInfo.browser;

  return (
    <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs ${info.bgColor} ${info.color} ${className}`} title={info.description}>
      <span className="mr-1">{info.icon}</span>
      {info.text}
    </div>
  );
};

// ---- Utilities ----
const fmtDate = (d) => new Date(d + "T00:00:00").toLocaleDateString();
const shortUID = (uid) => (uid?.length > 16 ? `…${uid.slice(-16)}` : uid);

export default function StudiesPage() {
  const [q, setQ] = useState("");
  const [modality, setModality] = useState("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [expanded, setExpanded] = useState({});
  const [studies, setStudies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingStudy, setEditingStudy] = useState(null);
  const [formData, setFormData] = useState({
    studyDate: '',
    studyTime: '',
    accessionNumber: '',
    description: '',
    modality: 'CT',
    status: 'scheduled',
    patient: { name: '', mrn: '', birthDate: '' }
  });

  // Get current storage configuration
  const [appConfig, setAppConfig] = useState(null);
  const storageConfig = getDataStorageConfig();

  // Load config and studies
  useEffect(() => {
    const loadData = async () => {
      const config = await getConfig();
      setAppConfig(config);
      await loadStudies();
    };
    loadData();
  }, []);

  const loadStudies = async () => {
    setLoading(true);
    try {
      const data = await listStudies();
      setStudies(data);
    } catch (error) {
      console.error('Failed to load studies:', error);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    return studies.filter((s) => {
      const matchQ = q
        ? [s.patient.name, s.patient.mrn, s.accessionNumber, s.description]
          .join(" ")
          .toLowerCase()
          .includes(q.toLowerCase())
        : true;
      const matchMod = modality === "ALL" ? true : s.modality === modality;
      const t = new Date(s.studyDate).getTime();
      const fromOk = from ? t >= new Date(from).getTime() : true;
      const toOk = to ? t < new Date(to).getTime() + 24 * 3600 * 1000 : true;
      return matchQ && matchMod && fromOk && toOk;
    });
  }, [studies, q, modality, from, to]);

  const toggle = (id) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const handleCreate = () => {
    setEditingStudy(null);
    setFormData({
      studyDate: new Date().toISOString().split('T')[0],
      studyTime: new Date().toTimeString().split(' ')[0],
      accessionNumber: `ACC-${Date.now()}`,
      description: '',
      modality: 'CT',
      status: 'scheduled',
      patient: { name: '', mrn: '', birthDate: '' }
    });
    setShowForm(true);
  };

  const handleEdit = async (study) => {
    setEditingStudy(study);
    setFormData({
      studyDate: study.studyDate,
      studyTime: study.studyTime,
      accessionNumber: study.accessionNumber,
      description: study.description,
      modality: study.modality,
      status: study.status,
      patient: { ...study.patient }
    });
    setShowForm(true);
  };

  const handleDelete = async (study) => {
    if (!confirm(`Delete study ${study.accessionNumber}?`)) return;

    try {
      await deleteStudy(study.studyId);
      await loadStudies();
    } catch (error) {
      console.error('Failed to delete study:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      if (editingStudy) {
        await updateStudy(editingStudy.studyId, formData);
      } else {
        await createStudy(formData);
      }
      setShowForm(false);
      await loadStudies();
    } catch (error) {
      console.error('Failed to save study:', error);
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingStudy(null);
  };

  if (!appConfig) return <div className="p-6">Loading…</div>;
  if (loading) return <div className="p-6">Loading studies…</div>;

  const registry = loadRegistry();
  const studiesConfig = registry.studies || { enabled: false };
  const backendEnabled = studiesConfig.enabled === true;
  const storageType = backendEnabled ? 'external' : (storageConfig.mode === 'server' ? 'server' : 'browser');

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Studies</h1>
            <p className="text-sm text-gray-500">List pemeriksaan dengan rincian Series per Study.</p>
          </div>
          <StorageIndicator storageType={storageType} />
        </div>
        <button
          onClick={handleCreate}
          className="rounded-xl bg-blue-600 text-white px-4 py-2 hover:bg-blue-700 flex items-center gap-2"
        >
          <span>➕</span>
          Add Study
        </button>
      </header>

      {/* Create/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-semibold mb-4">
              {editingStudy ? 'Edit Study' : 'Create New Study'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Study Date</label>
                  <input
                    type="date"
                    value={formData.studyDate}
                    onChange={(e) => setFormData({ ...formData, studyDate: e.target.value })}
                    required
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Study Time</label>
                  <input
                    type="time"
                    value={formData.studyTime}
                    onChange={(e) => setFormData({ ...formData, studyTime: e.target.value })}
                    required
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Accession Number</label>
                <input
                  type="text"
                  value={formData.accessionNumber}
                  onChange={(e) => setFormData({ ...formData, accessionNumber: e.target.value })}
                  required
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  required
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Modality</label>
                  <select
                    value={formData.modality}
                    onChange={(e) => setFormData({ ...formData, modality: e.target.value })}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="CT">CT</option>
                    <option value="MR">MR</option>
                    <option value="US">US</option>
                    <option value="XA">XA</option>
                    <option value="CR">CR</option>
                    <option value="DR">DR</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="scheduled">Scheduled</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-medium mb-3">Patient Information</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Patient Name</label>
                    <input
                      type="text"
                      value={formData.patient.name}
                      onChange={(e) => setFormData({
                        ...formData,
                        patient: { ...formData.patient, name: e.target.value }
                      })}
                      required
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">MRN</label>
                      <input
                        type="text"
                        value={formData.patient.mrn}
                        onChange={(e) => setFormData({
                          ...formData,
                          patient: { ...formData.patient, mrn: e.target.value }
                        })}
                        required
                        className="w-full rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Birth Date</label>
                      <input
                        type="date"
                        value={formData.patient.birthDate}
                        onChange={(e) => setFormData({
                          ...formData,
                          patient: { ...formData.patient, birthDate: e.target.value }
                        })}
                        required
                        className="w-full rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 rounded-xl bg-blue-600 text-white px-4 py-2 hover:bg-blue-700"
                >
                  {editingStudy ? 'Update Study' : 'Create Study'}
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="flex-1 rounded-xl border border-gray-300 px-4 py-2 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Filters */}
      <section className="bg-white rounded-2xl shadow p-4 grid grid-cols-1 md:grid-cols-6 gap-3">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium mb-1">Cari (patient/MRN/accession/desc)</label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="mis. Andi / MRN0001 / ACC-…"
            className="w-full rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Modality</label>
          <select
            value={modality}
            onChange={(e) => setModality(e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">All</option>
            <option value="CT">CT</option>
            <option value="MR">MR</option>
            <option value="US">US</option>
            <option value="XA">XA</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Tanggal dari</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Tanggal sampai</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="md:col-span-2 flex items-end gap-2">
          <button
            onClick={() => {
              setQ("");
              setModality("ALL");
              setFrom("");
              setTo("");
            }}
            className="rounded-xl border px-4 py-2 hover:bg-gray-50"
          >
            Reset
          </button>
          <div className="text-sm text-gray-500 ml-auto">{filtered.length} result(s)</div>
        </div>
      </section>

      {/* Table with Dropdown Menu */}
      <section className="bg-white rounded-2xl shadow overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-3 py-3 text-left whitespace-nowrap">Study Date/Time</th>
              <th className="px-3 py-3 text-left whitespace-nowrap">Patient</th>
              <th className="px-3 py-3 text-left whitespace-nowrap">Accession</th>
              <th className="px-3 py-3 text-left whitespace-nowrap">Modality</th>
              <th className="px-3 py-3 text-left whitespace-nowrap">Series</th>
              <th className="px-3 py-3 text-left whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((s) => {
              const isOpen = !!expanded[s.studyId];
              return (
                <React.Fragment key={s.studyId}>
                  <tr className="hover:bg-gray-50">
                    <td className="px-3 py-3 align-top whitespace-nowrap">
                      <div className="font-medium text-xs">{fmtDate(s.studyDate)}</div>
                      <div className="text-gray-500 text-xs">{s.studyTime}</div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="font-medium text-xs">{s.patient.name}</div>
                      <div className="text-gray-500 text-xs">MRN: {s.patient.mrn}</div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="text-xs">{s.accessionNumber}</div>
                      <div className="text-gray-500 text-xs font-mono">{shortUID(s.studyInstanceUID)}</div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {s.modality}
                      </span>
                    </td>
                    <td className="px-3 py-3 align-top text-center">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 text-xs font-medium">
                        {s.series.length}
                      </span>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <StudyActionsMenu
                        study={s}
                        onView={() => alert(`Open Viewer for ${s.studyId}`)}
                        onEdit={() => handleEdit(s)}
                        onDelete={() => handleDelete(s)}
                        onToggleSeries={() => toggle(s.studyId)}
                        isExpanded={isOpen}
                      />
                    </td>
                  </tr>

                  {/* Series Row */}
                  {isOpen && (
                    <tr className="bg-gray-50/50">
                      <td colSpan={6} className="px-6 py-4">
                        <div className="text-sm text-gray-600 mb-2">
                          <span className="font-medium">Study Description:</span> {s.description}
                        </div>
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-sm bg-white rounded-xl overflow-hidden">
                            <thead className="bg-gray-100">
                              <tr>
                                <th className="px-3 py-2 text-left">Series #</th>
                                <th className="px-3 py-2 text-left">Series UID</th>
                                <th className="px-3 py-2 text-left">Modality</th>
                                <th className="px-3 py-2 text-left">Description</th>
                                <th className="px-3 py-2 text-left">Instances</th>
                                <th className="px-3 py-2 text-left">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {s.series
                                .slice()
                                .sort((a, b) => a.seriesNumber - b.seriesNumber)
                                .map((se) => (
                                  <tr key={se.seriesId} className="hover:bg-gray-50">
                                    <td className="px-3 py-2">{se.seriesNumber}</td>
                                    <td className="px-3 py-2 font-mono">{shortUID(se.seriesInstanceUID)}</td>
                                    <td className="px-3 py-2">{se.modality}</td>
                                    <td className="px-3 py-2">{se.description}</td>
                                    <td className="px-3 py-2">{se.instances.length}</td>
                                    <td className="px-3 py-2">
                                      <button
                                        onClick={() => alert(`Open Series ${se.seriesId}`)}
                                        className="rounded-lg border px-3 py-1 hover:bg-gray-50"
                                      >
                                        Open Series
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
