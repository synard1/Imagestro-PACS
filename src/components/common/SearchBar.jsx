import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';

export default function SearchBar({ onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }

    // Mock search results
    const mockResults = [
      {
        type: 'study',
        id: 1,
        title: 'CT Brain - John Doe',
        subtitle: 'Acc: ACC001 | 2025-11-15',
        path: '/studies/1'
      },
      {
        type: 'patient',
        id: 2,
        title: 'Jane Smith',
        subtitle: 'ID: P002 | DOB: 1985-05-20',
        path: '/patients/2'
      }
    ];

    setResults(mockResults.filter(r => 
      r.title.toLowerCase().includes(query.toLowerCase())
    ));
  }, [query]);

  const handleSelect = (result) => {
    navigate(result.path);
    onClose();
  };

  return (
    <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-lg shadow-xl border border-gray-200 z-50 max-h-96 overflow-y-auto">
      {results.length === 0 && query.length >= 2 ? (
        <div className="p-4 text-center text-gray-500">
          No results found
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {results.map((result) => (
            <button
              key={`${result.type}-${result.id}`}
              onClick={() => handleSelect(result)}
              className="w-full p-4 text-left hover:bg-gray-50 transition-colors"
            >
              <div className="font-medium text-gray-900">{result.title}</div>
              <div className="text-sm text-gray-500">{result.subtitle}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
