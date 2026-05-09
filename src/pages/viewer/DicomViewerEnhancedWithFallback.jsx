import { useNavigate, useParams } from 'react-router-dom';
import { ViewerErrorBoundary } from '../../components/viewer/ViewerErrorBoundary';
import DicomViewerEnhanced from './DicomViewerEnhanced';

export default function DicomViewerEnhancedWithFallback() {
  const { studyId } = useParams();
  const navigate = useNavigate();

  const handleFallback = () => navigate(`/viewer/${studyId}`);

  return (
    <ViewerErrorBoundary onFallback={handleFallback}>
      <DicomViewerEnhanced />
    </ViewerErrorBoundary>
  );
}
