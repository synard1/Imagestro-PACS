import { Outlet } from 'react-router-dom';
import ReportsLayout from '../../components/layout/ReportsLayout';

export default function ReportsWrapper() {
  return (
    <ReportsLayout>
      <Outlet />
    </ReportsLayout>
  );
}
