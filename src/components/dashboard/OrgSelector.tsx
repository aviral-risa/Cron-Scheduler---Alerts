import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ORGANIZATIONS } from '../../config/organizations';

interface OrgSelectorProps {
  selectedOrgId: string;
  onOrgChange: (orgId: string) => void;
}

export function OrgSelector({ selectedOrgId, onOrgChange }: OrgSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="org-select" className="text-sm font-medium">
        Organization:
      </label>
      <Select value={selectedOrgId} onValueChange={onOrgChange}>
        <SelectTrigger id="org-select" className="w-[250px]">
          <SelectValue placeholder="Select organization" />
        </SelectTrigger>
        <SelectContent>
          {ORGANIZATIONS.map((org) => (
            <SelectItem key={org.id} value={org.id}>
              {org.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
