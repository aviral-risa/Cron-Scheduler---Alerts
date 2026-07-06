import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronDown, Check } from 'lucide-react';
import { ACTIVE_TEAM_MEMBERS } from '@/config/team-members';

interface PersonSelectorProps {
  selectedPersonId: string | null;
  onChange: (personId: string) => void;
}

export function PersonSelector({ selectedPersonId, onChange }: PersonSelectorProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const selectedPerson = ACTIVE_TEAM_MEMBERS.find(m => m.id === selectedPersonId);

  const filteredMembers = ACTIVE_TEAM_MEMBERS.filter(member =>
    member.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    member.organization.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="relative">
      <label className="text-sm font-medium mr-3">Person:</label>
      <Button
        variant="outline"
        onClick={() => setOpen(!open)}
        className="w-[280px] justify-between"
      >
        <span className="truncate">
          {selectedPerson ? `${selectedPerson.name} (${selectedPerson.organization})` : 'Select a person...'}
        </span>
        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />

          {/* Dropdown */}
          <div className="absolute z-20 mt-1 w-[280px] bg-white border border-border rounded-md shadow-lg max-h-[400px] overflow-hidden">
            {/* Search Input */}
            <div className="p-2 border-b border-border">
              <input
                type="text"
                placeholder="🔍 Search team members..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                autoFocus
              />
            </div>

            {/* Team Members List */}
            <div className="overflow-y-auto max-h-[340px]">
              {filteredMembers.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground text-center">
                  No team members found
                </div>
              ) : (
                filteredMembers.map((member) => (
                  <button
                    key={member.id}
                    onClick={() => {
                      onChange(member.id);
                      setOpen(false);
                      setSearchQuery('');
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-accent transition-colors"
                  >
                    <div className="flex flex-col items-start">
                      <span className="font-medium">{member.name}</span>
                      <span className="text-xs text-muted-foreground">{member.organization}</span>
                    </div>
                    {selectedPersonId === member.id && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
