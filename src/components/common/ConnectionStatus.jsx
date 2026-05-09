import { SignalIcon, SignalSlashIcon } from '@heroicons/react/24/outline';

export default function ConnectionStatus({ status = 'connected' }) {
  const isConnected = status === 'connected';

  return (
    <div className="flex items-center space-x-2">
      {isConnected ? (
        <>
          <SignalIcon className="h-4 w-4 text-green-500" />
          <span className="text-xs text-green-500">Connected</span>
        </>
      ) : (
        <>
          <SignalSlashIcon className="h-4 w-4 text-red-500" />
          <span className="text-xs text-red-500">Disconnected</span>
        </>
      )}
    </div>
  );
}
