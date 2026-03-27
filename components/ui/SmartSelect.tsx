import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, ChevronDown, Check } from 'lucide-react';

interface SmartSelectOption {
  id: string;
  label: string;
  subLabel?: string;
  tags?: string[];
  data?: any;
}

interface FilterOption {
  id: string;
  label: string;
  predicate: (item: any) => boolean;
}

interface SmartSelectProps {
  options: SmartSelectOption[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  filters?: FilterOption[];
  className?: string;
  triggerClassName?: string;
  disabled?: boolean;
}

export const SmartSelect: React.FC<SmartSelectProps> = ({
  options,
  value,
  onChange,
  label,
  placeholder = "Select...",
  filters = [],
  className = "",
  triggerClassName = "",
  disabled = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeFilterId, setActiveFilterId] = useState<string>('all');
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Selected Item Display
  const selectedItem = options.find(o => o.id === value);

  // Filtered Options
  const filteredOptions = useMemo(() => {
    let result = options;

    // 1. Apply Category Filter
    if (activeFilterId !== 'all') {
      const filter = filters.find(f => f.id === activeFilterId);
      if (filter) {
        result = result.filter(opt => filter.predicate(opt.data));
      }
    }

    // 2. Apply Search
    if (search) {
      const lowerSearch = search.toLowerCase();
      result = result.filter(opt => 
        opt.label.toLowerCase().includes(lowerSearch) || 
        opt.subLabel?.toLowerCase().includes(lowerSearch)
      );
    }

    return result;
  }, [options, search, activeFilterId, filters]);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && <label className="text-xs font-semibold text-slate-600 block mb-1.5">{label}</label>}
      
      {/* Trigger Button */}
      <div 
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`
          w-full bg-white border rounded-md px-3 py-2.5 md:py-2 text-sm flex items-center justify-between cursor-pointer transition-all
          ${isOpen ? 'ring-2 ring-blue-500/20 border-blue-500' : 'border-slate-300 hover:border-slate-400'}
          ${disabled ? 'opacity-60 cursor-not-allowed bg-slate-50' : ''}
          ${triggerClassName}
        `}
      >
        <div className="flex-1 truncate">
          {selectedItem ? (
            <div className="flex flex-col leading-tight">
              <span className="font-medium text-slate-900">{selectedItem.label}</span>
              {selectedItem.subLabel && <span className="text-[10px] text-slate-500">{selectedItem.subLabel}</span>}
            </div>
          ) : (
            <span className="text-slate-400">{placeholder}</span>
          )}
        </div>
        <ChevronDown size={16} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 overflow-hidden animate-fade-in">
          
          {/* Search Bar */}
          <div className="p-2 border-b border-slate-100 bg-slate-50">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
              <input 
                type="text" 
                autoFocus
                placeholder="Search..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-md focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Filters */}
          {filters.length > 0 && (
            <div className="flex gap-1 p-2 border-b border-slate-100 overflow-x-auto scrollbar-hide">
              <button
                onClick={() => setActiveFilterId('all')}
                className={`px-2 py-1 rounded text-[10px] font-bold uppercase whitespace-nowrap transition-colors ${activeFilterId === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
              >
                All
              </button>
              {filters.map(f => (
                <button
                  key={f.id}
                  onClick={() => setActiveFilterId(f.id)}
                  className={`px-2 py-1 rounded text-[10px] font-bold uppercase whitespace-nowrap transition-colors ${activeFilterId === f.id ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}

          {/* Options List */}
          <div className="max-h-60 overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400 italic">No options found.</div>
            ) : (
              filteredOptions.map(option => (
                <div 
                  key={option.id}
                  onClick={() => {
                    onChange(option.id);
                    setIsOpen(false);
                    setSearch('');
                  }}
                  className={`
                    px-3 py-2 cursor-pointer border-b border-slate-50 last:border-0 hover:bg-blue-50 transition-colors flex items-center justify-between
                    ${value === option.id ? 'bg-blue-50/50' : ''}
                  `}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">{option.label}</div>
                    {option.subLabel && <div className="text-xs text-slate-500 truncate">{option.subLabel}</div>}
                  </div>
                  {value === option.id && <Check size={16} className="text-blue-600 ml-2" />}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
