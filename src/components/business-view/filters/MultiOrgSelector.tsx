import { ORGANIZATIONS } from '@/config/organizations';
import { Button } from '@/components/ui/button';

interface MultiOrgSelectorProps {
  selectedOrgIds: string[];
  onChange: (orgIds: string[]) => void;
}

export function MultiOrgSelector({ selectedOrgIds, onChange }: MultiOrgSelectorProps) {
  const allOrgIds = ORGANIZATIONS.map((org) => org.facilityId);
  const isAllSelected = selectedOrgIds.length === 0 || selectedOrgIds.length === allOrgIds.length;

  const toggleOrg = (facilityId: string) => {
    if (selectedOrgIds.includes(facilityId)) {
      // Remove org
      const newSelection = selectedOrgIds.filter((id) => id !== facilityId);
      onChange(newSelection.length === 0 ? [] : newSelection);
    } else {
      // Add org
      onChange([...selectedOrgIds, facilityId]);
    }
  };

  const toggleAll = () => {
    if (isAllSelected) {
      // Currently all selected, clear selection (but we'll keep empty array meaning "all")
      onChange([]);
    } else {
      // Select all
      onChange([]);
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Organizations</label>
      <div className="flex flex-wrap gap-2">
        <Button
          variant={isAllSelected ? 'default' : 'outline'}
          size="sm"
          onClick={toggleAll}
        >
          All Organizations
        </Button>
        {ORGANIZATIONS.map((org) => {
          const isSelected = selectedOrgIds.length === 0 || selectedOrgIds.includes(org.facilityId);
          return (
            <Button
              key={org.id}
              variant={isSelected ? 'default' : 'outline'}
              size="sm"
              onClick={() => toggleOrg(org.facilityId)}
            >
              {org.name}
            </Button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {isAllSelected
          ? 'All organizations selected'
          : `${selectedOrgIds.length} organization${selectedOrgIds.length === 1 ? '' : 's'} selected`}
      </p>
    </div>
  );
}
