import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MagnifyingGlassIcon, CommandLineIcon } from '@heroicons/react/24/outline';
import featuresData from '../../data/quickSearchFeatures.json';

/**
 * Quick Search Component for PACS
 * Integrated into existing layout header
 * Supports searching for:
 * 1. Studies (Patient ID, Name, Accession)
 * 2. Application Features / Menus
 */
export default function QuickSearch({ className = '' }) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [filteredFeatures, setFilteredFeatures] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const navigate = useNavigate();
  const wrapperRef = useRef(null);

  // Filter features based on query
  useEffect(() => {
    if (!query.trim()) {
      setFilteredFeatures([]);
      return;
    }

    const searchTerm = query.toLowerCase();
    const matches = featuresData.filter(feature =>
      feature.title.toLowerCase().includes(searchTerm) ||
      feature.keywords.some(k => k.toLowerCase().includes(searchTerm))
    ).slice(0, 5); // Limit to 5 results

    setFilteredFeatures(matches);
    setSelectedIndex(-1);
  }, [query]);

  // Handle outside click to close suggestions
  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [wrapperRef]);

  const handleSearch = (e) => {
    e.preventDefault();

    // If a feature is selected via keyboard, navigate to it
    if (selectedIndex >= 0 && selectedIndex < filteredFeatures.length) {
      handleFeatureSelect(filteredFeatures[selectedIndex]);
      return;
    }

    // Otherwise perform standard study search
    if (query.trim()) {
      navigate(`/studies?search=${encodeURIComponent(query)}`);
      setQuery('');
      setIsOpen(false);
    }
  };

  const handleFeatureSelect = (feature) => {
    navigate(feature.path);
    setQuery('');
    setIsOpen(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < filteredFeatures.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > -1 ? prev - 1 : prev));
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <form onSubmit={handleSearch} className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search studies or features (e.g. 'Orders')..."
          className="w-full px-3 py-1.5 pl-9 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <MagnifyingGlassIcon className="w-4 h-4 text-slate-400 absolute left-3 top-2" />
      </form>

      {/* Search Suggestions */}
      {isOpen && (query.trim().length > 0) && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-md shadow-lg z-50 overflow-hidden">

          {/* Feature Results */}
          {filteredFeatures.length > 0 && (
            <div className="border-b border-slate-100">
              <div className="px-3 py-1.5 text-xs font-semibold text-slate-500 bg-slate-50 uppercase tracking-wider">
                Features & Menus
              </div>
              <ul>
                {filteredFeatures.map((feature, index) => (
                  <li
                    key={feature.id}
                    onClick={() => handleFeatureSelect(feature)}
                    className={`px-3 py-2 text-sm cursor-pointer flex items-center gap-2 ${index === selectedIndex ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50 text-slate-700'
                      }`}
                  >
                    <CommandLineIcon className="w-4 h-4 text-slate-400" />
                    <div className="flex flex-col">
                      <span className="font-medium">{feature.title}</span>
                      <span className="text-xs text-slate-400">Go to {feature.title}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Default Search Action */}
          <div
            className={`p-2 text-xs text-slate-500 cursor-pointer hover:bg-slate-50 ${selectedIndex === -1 && filteredFeatures.length > 0 ? '' : ''}`}
            onClick={handleSearch}
          >
            <div className="flex items-center gap-2">
              <MagnifyingGlassIcon className="w-3 h-3" />
              <span>Search for <strong>"{query}"</strong> in Studies</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
