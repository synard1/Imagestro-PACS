import StudyCard from '../../components/pacs/StudyCard';

export default function StudyGrid({ studies, onStudySelect, onView, onReport, onDelete, onArchive }) {
  const handleView = (study) => {
    onView(study);
  };

  const handleReport = (study) => {
    onReport(study);
  };

  const handleDelete = (study) => {
    if (window.confirm(`Delete study ${study.patientName}?`)) {
      onDelete && onDelete(study);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
      {studies.map((study) => (
        <StudyCard
          key={study.id}
          study={study}
          onClick={() => onStudySelect(study)}
          onView={onView}
          onReport={onReport}
          onDelete={onDelete}
          onArchive={onArchive}
        />
      ))}
    </div>
  );
}
