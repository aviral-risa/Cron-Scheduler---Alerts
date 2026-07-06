/**
 * Team Members Configuration
 * Maps team member names to their assigned_to IDs and organizations for queue tracking
 */

export interface TeamMember {
  name: string;
  id: string;
  organization: string; // Organization short name (NYCBS, CHC, MBPCC, UCBC)
}

export const TEAM_MEMBERS: TeamMember[] = [
  { name: 'Anikrishna M', id: 'ynXXPkfvmbdfbEMVPo8jDHJA6n02', organization: 'NYCBS' },
  { name: 'Ankita', id: '5yclyafYgYaZXdAVqXSnrbdzRXK2', organization: 'NYCBS' },
  { name: 'Annmariya', id: 'l5rpK84F4ecSaM3mz1Kki4wRhwG3', organization: 'MBPCC' },
  { name: 'Anu Sagar', id: '0xErG33PBHXCETKjWgGOvuNYBg53', organization: 'MBPCC' },
  { name: 'Anurag', id: '74jlfvFzQ3RaoejElo9T1wqxl0f2', organization: 'NYCBS' },
  { name: 'Aswathi', id: 'pCbkYa0gVSWBgnHreZx1lEcVdSu2', organization: 'CHC' },
  { name: 'ayman', id: '89FpZc3qgWXocysnPy3BaLTM3X93', organization: 'NYCBS' },
  { name: 'Chandra Lekha', id: 'G6wVvk3K55esRxsOsiuuxF8Hgne2', organization: 'NYCBS' },
  { name: 'Hari', id: 'Ey9cvoKUyjXiOwwMwwqpPwtEZ1P2', organization: 'CHC' },
  { name: 'Harshita', id: 'UkrY1c212zQjMeJZItMNRCWqUlr2', organization: 'NYCBS' },
  { name: 'imran', id: 'GyKeU7Do2TaPF2gU6lRyKHQhVV03', organization: 'CHC' },
  { name: 'Jyothi', id: 'b4rht4JNIeXcypKChLf9napX8D53', organization: 'CHC' },
  { name: 'Karthik V', id: 'LNiPUVjo7uRsJpLSzJYfb8Fl1bl2', organization: 'NYCBS' },
  { name: 'Kayal', id: 'elw2PjRhHEdfPuho5abnFsG2XDE3', organization: 'NYCBS' },
  { name: 'Labanya', id: 'BCW7Xs9qOfOp7nIwt9N5sAtW8hC2', organization: 'NYCBS' },
  { name: 'Leema', id: 'kq9JEfpkioc25czS2yh57rK1RgT2', organization: 'CHC' },
  { name: 'Manna Ria', id: 'nf1iY12IVzbjybkn411g91hVXxD2', organization: 'CHC' },
  { name: 'Manoj Kumar', id: 'OnmvdX1EhfWqioGMGbL5XTsfLOG2', organization: 'UCBC' },
  { name: 'Narasana', id: 'JuXTWjOGukciaGNjySw0dYnTAOo2', organization: 'NYCBS' },
  { name: 'Narmada', id: 'Nq5CzxCyIGTQu4lbjDTOMIRBFDt2', organization: 'UCBC' },
  { name: 'Neethu', id: 'PgcRXaMDSMMSVDR8fkf6oe6mgap1', organization: 'NYCBS' },
  { name: 'Nisarga', id: 'HW7yyw551ZaENoA39TxGwzljjjQ2', organization: 'MBPCC' },
  { name: 'Nisha', id: 'Be7MuvsgTFVQwhaVj558xXWcvSC3', organization: 'CHC' },
  { name: 'Parvati Nair', id: 'cTALXwXEpvRUHhkbzu4yo90GuGf1', organization: 'NYCBS' },
  { name: 'Pavithra', id: 'gZJqglV1SZWvdzVzrUC8XIDDI0L2', organization: 'UCBC' },
  { name: 'Puja', id: 'MQsxwC2C7FZkxY3Oqky1ZyzLgRu1', organization: 'MBPCC' },
  { name: 'Ramitha', id: 'RLTyJEM06kNHEkWbAGyIL6OMqMp1', organization: 'NYCBS' },
  { name: 'Ria', id: '8uH1EJpQiEgeXVrBIEo8XwNZjy02', organization: 'NYCBS' },
  { name: 'Risa Agent', id: 'i2kq2DqPnCe6otzBscWFSge5kd72', organization: 'NYCBS' },
  { name: 'Rohan', id: 'Z6OFZ6wnLkXQ5ho2niaNQJ2Knb23', organization: 'NYCBS' },
  { name: 'Sandra', id: 'iNrV9d82orWDA41dNC8aTwv8Bm92', organization: 'NYCBS' },
  { name: 'Shahdunissa', id: '3fEWzbdo6falKHudEy8xHLnjmTi1', organization: 'MBPCC' },
  { name: 'Shaheen', id: '8hsS8LsgrBgzUoHQQ4CGOcwZG7u1', organization: 'NYCBS' },
  { name: 'shreevani', id: 'cCbHJK9VEHM2oc3n7peXQjbsYIJ3', organization: 'MBPCC' },
  { name: 'sivaparvathy', id: 'tnco9I2B6YNmLdBJefIOIeFYSmZ2', organization: 'NYCBS' },
  { name: 'Vaibhavi', id: 'nuymRcS80qVW7UWkKTm0uJIROO43', organization: 'NYCBS' },
  { name: 'Varsha', id: 'rjokB3ikGve3SPKyURL7E2kPWKC2', organization: 'NYCBS' },
  { name: 'Vishal', id: 'zwjSNfDUOXb6Ufed1mXM3J3kZJn2', organization: 'CHC' },
];

// Exclude unassigned and Risa Agent from queue tracking
export const ACTIVE_TEAM_MEMBERS = TEAM_MEMBERS.filter(
  (member) => member.id !== 'unassigned' && member.id !== 'i2kq2DqPnCe6otzBscWFSge5kd72'
);

/**
 * Get team members by organization
 */
export function getTeamMembersByOrg(orgName: string): TeamMember[] {
  return ACTIVE_TEAM_MEMBERS.filter((member) => member.organization === orgName);
}

/**
 * Get organization name to facility ID mapping
 */
export function getOrgNameToFacilityId(orgName: string): string | undefined {
  const orgMap: Record<string, string> = {
    'NYCBS': 'HhwIHO4npKhrxyylkC33',
    'CHC': '4BlQ4SsqAVTDgFKApKZr',
    'MBPCC': '3GKbZtgpPru1vJGCkxwR',
    'UCBC': 'W14MolgUu7OYvX4CFQJn',
  };
  return orgMap[orgName];
}

export function getTeamMemberById(id: string): TeamMember | undefined {
  return TEAM_MEMBERS.find((member) => member.id === id);
}

export function getTeamMemberByName(name: string): TeamMember | undefined {
  return TEAM_MEMBERS.find((member) => member.name === name);
}
