'use client';

import { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, Check, Building2, Dumbbell, Coffee, Utensils, Stethoscope, HeartPulse, Sparkles, Hotel, ShoppingBag, Wrench, GraduationCap, HelpCircle } from 'lucide-react';
import { BUSINESS_CATEGORIES, BusinessCategory } from '@/lib/categories';

interface CategorySelectProps {
  value?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
  id?: string;
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  'gym-fitness': <Dumbbell className="h-4 w-4 text-emerald-500 flex-shrink-0" />,
  'cafe-coffee-shop': <Coffee className="h-4 w-4 text-amber-500 flex-shrink-0" />,
  'restaurant': <Utensils className="h-4 w-4 text-orange-500 flex-shrink-0" />,
  'hospital-healthcare': <Stethoscope className="h-4 w-4 text-blue-500 flex-shrink-0" />,
  'dental-clinic': <HeartPulse className="h-4 w-4 text-cyan-500 flex-shrink-0" />,
  'salon-beauty': <Sparkles className="h-4 w-4 text-pink-500 flex-shrink-0" />,
  'hotel-hospitality': <Hotel className="h-4 w-4 text-indigo-500 flex-shrink-0" />,
  'retail-store': <ShoppingBag className="h-4 w-4 text-purple-500 flex-shrink-0" />,
  'automobile-service': <Wrench className="h-4 w-4 text-red-500 flex-shrink-0" />,
  'education-coaching': <GraduationCap className="h-4 w-4 text-teal-500 flex-shrink-0" />,
  'other': <HelpCircle className="h-4 w-4 text-gray-400 flex-shrink-0" />,
};

export function CategorySelect({ value, onChange, disabled, error, id = 'category-select' }: CategorySelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedCategory = BUSINESS_CATEGORIES.find(c => c.id === value || c.slug === value);

  const filteredCategories = BUSINESS_CATEGORIES.filter(cat =>
    cat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    cat.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    cat.defaultTags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearchQuery('');
    }
  }, [isOpen]);

  const handleSelect = (category: BusinessCategory) => {
    onChange(category.id);
    setIsOpen(false);
  };

  return (
    <div className="relative w-full" ref={containerRef} id={id}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg border text-sm text-left transition-all ${
          error
            ? 'border-red-500 focus:ring-2 focus:ring-red-500/20'
            : isOpen
            ? 'border-primary-500 ring-2 ring-primary-500/20 dark:border-primary-400'
            : 'border-secondary-200 dark:border-secondary-700 hover:border-secondary-300 dark:hover:border-secondary-600'
        } bg-white dark:bg-secondary-900 text-secondary-900 dark:text-white ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
        }`}
      >
        <div className="flex items-center gap-2.5 truncate">
          {selectedCategory ? (
            <>
              {CATEGORY_ICONS[selectedCategory.id] || <Building2 className="h-4 w-4 text-secondary-400" />}
              <span className="font-medium truncate">{selectedCategory.name}</span>
            </>
          ) : (
            <>
              <Building2 className="h-4 w-4 text-secondary-400 flex-shrink-0" />
              <span className="text-secondary-400 dark:text-secondary-500">Select business category...</span>
            </>
          )}
        </div>
        <ChevronDown className={`h-4 w-4 text-secondary-400 transition-transform flex-shrink-0 ml-2 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1.5 w-full bg-white dark:bg-secondary-900 rounded-xl shadow-xl border border-secondary-200 dark:border-secondary-700 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          {/* Search box inside dropdown */}
          <div className="p-2 border-b border-secondary-100 dark:border-secondary-800 bg-secondary-50/50 dark:bg-secondary-800/50">
            <div className="relative flex items-center">
              <Search className="absolute left-2.5 h-3.5 w-3.5 text-secondary-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search category (e.g. Gym, Cafe, Hospital)..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-secondary-900 border border-secondary-200 dark:border-secondary-700 rounded-md focus:outline-none focus:ring-1 focus:ring-primary-500 text-secondary-900 dark:text-white placeholder:text-secondary-400"
              />
            </div>
          </div>

          {/* Options list */}
          <div className="max-h-60 overflow-y-auto p-1.5 space-y-0.5 scrollbar-thin">
            {filteredCategories.length === 0 ? (
              <div className="py-6 text-center text-xs text-secondary-500 dark:text-secondary-400">
                No business category matches &ldquo;{searchQuery}&rdquo;
              </div>
            ) : (
              filteredCategories.map(cat => {
                const isSelected = selectedCategory?.id === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handleSelect(cat)}
                    className={`w-full flex items-start gap-2.5 px-3 py-2 rounded-lg text-left text-xs transition-colors ${
                      isSelected
                        ? 'bg-primary-50 dark:bg-primary-950/40 text-primary-900 dark:text-primary-100 font-medium'
                        : 'hover:bg-secondary-100 dark:hover:bg-secondary-800 text-secondary-800 dark:text-secondary-200'
                    }`}
                  >
                    <div className="mt-0.5">
                      {CATEGORY_ICONS[cat.id] || <Building2 className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-secondary-900 dark:text-white truncate">{cat.name}</span>
                        {isSelected && <Check className="h-3.5 w-3.5 text-primary-600 dark:text-primary-400 ml-1.5 flex-shrink-0" />}
                      </div>
                      <p className="text-[11px] text-secondary-500 dark:text-secondary-400 line-clamp-1 mt-0.5">
                        {cat.description}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {cat.defaultTags.slice(0, 3).map(tag => (
                          <span
                            key={tag}
                            className="inline-block text-[10px] px-1.5 py-0.2 rounded bg-secondary-100 dark:bg-secondary-800 text-secondary-600 dark:text-secondary-400"
                          >
                            {tag}
                          </span>
                        ))}
                        {cat.defaultTags.length > 3 && (
                          <span className="text-[10px] text-secondary-400">
                            +{cat.defaultTags.length - 3} more
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
