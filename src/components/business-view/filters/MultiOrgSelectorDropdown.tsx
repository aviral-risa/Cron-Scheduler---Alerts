/**
 * Multi-Select Organization Dropdown
 * Compact dropdown for selecting multiple organizations
 */

import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { ORGANIZATIONS } from '@/config/organizations';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface MultiOrgSelectorDropdownProps {
  selectedOrgIds: string[];
  onChange: (orgIds: string[]) => void;
  hideAllOption?: boolean; // Hide "All Organizations" option
}

export function MultiOrgSelectorDropdown({
  selectedOrgIds,
  onChange,
  hideAllOption = false,
}: MultiOrgSelectorDropdownProps) {
  const [open, setOpen] = useState(false);

  const allOrgIds = ORGANIZATIONS.map((org) => org.facilityId);
  const isAllSelected = selectedOrgIds.length === 0 || selectedOrgIds.length === allOrgIds.length;

  const toggleOrg = (facilityId: string) => {
    if (selectedOrgIds.includes(facilityId)) {
      const newSelection = selectedOrgIds.filter((id) => id !== facilityId);
      onChange(newSelection.length === 0 ? [] : newSelection);
    } else {
      onChange([...selectedOrgIds, facilityId]);
    }
  };

  const toggleAll = () => {
    onChange([]);
  };

  const getDisplayText = () => {
    if (isAllSelected && !hideAllOption) {
      return 'All Organizations';
    }
    if (selectedOrgIds.length === 1) {
      const org = ORGANIZATIONS.find((o) => o.facilityId === selectedOrgIds[0]);
      return org?.name || '1 organization';
    }
    if (selectedOrgIds.length === 0) {
      return 'Select organizations';
    }
    return `${selectedOrgIds.length} organizations`;
  };

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm font-medium whitespace-nowrap">
        Organizations:
      </label>
      <div className="relative">
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[250px] justify-between"
          onClick={() => setOpen(!open)}
        >
          {getDisplayText()}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>

        {open && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-10"
              onClick={() => setOpen(false)}
            />

            {/* Dropdown Content */}
            <div className="absolute z-20 mt-1 w-[250px] bg-white border border-border rounded-md shadow-lg">
              <div className="max-h-[300px] overflow-y-auto p-1">
                {/* All Organizations Option */}
                {!hideAllOption && (
                  <div
                    className={cn(
                      'flex items-center gap-2 rounded-sm px-2 py-1.5 cursor-pointer hover:bg-accent',
                      isAllSelected && 'bg-accent'
                    )}
                    onClick={() => {
                      toggleAll();
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        'h-4 w-4',
                        isAllSelected ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <span className="text-sm font-medium">All Organizations</span>
                  </div>
                )}

                {/* Individual Organizations */}
                {ORGANIZATIONS.map((org) => {
                  const isSelected = selectedOrgIds.length === 0 || selectedOrgIds.includes(org.facilityId);
                  return (
                    <div
                      key={org.id}
                      className={cn(
                        'flex items-center gap-2 rounded-sm px-2 py-1.5 cursor-pointer hover:bg-accent',
                        isSelected && !isAllSelected && 'bg-accent'
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleOrg(org.facilityId);
                      }}
                    >
                      <Check
                        className={cn(
                          'h-4 w-4',
                          isSelected ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      <span className="text-sm">{org.name}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
