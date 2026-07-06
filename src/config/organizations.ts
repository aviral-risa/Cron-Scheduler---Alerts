export interface Organization {
  id: string;
  name: string;
  facilityId: string;
  teamSize: number;
  expectedDailyOrders: number;
  slackChannelId: string;
}

export const ORGANIZATIONS: Organization[] = [
  {
    id: 'nycbs',
    name: 'NYCBS',
    facilityId: 'HhwIHO4npKhrxyylkC33',
    teamSize: 22,
    expectedDailyOrders: 1200,
    slackChannelId: 'C095RF3PUPQ',
  },
  {
    id: 'chc',
    name: 'CHC',
    facilityId: '4BlQ4SsqAVTDgFKApKZr',
    teamSize: 8,
    expectedDailyOrders: 600,
    slackChannelId: 'C08URBCJ17G',
  },
  {
    id: 'mbpcc',
    name: 'MBPCC',
    facilityId: '3GKbZtgpPru1vJGCkxwR',
    teamSize: 5,
    expectedDailyOrders: 400,
    slackChannelId: 'C093NF28DA6',
  },
  {
    id: 'ucbc',
    name: 'UCBC',
    facilityId: 'W14MolgUu7OYvX4CFQJn',
    teamSize: 4,
    expectedDailyOrders: 300,
    slackChannelId: 'C0988JPJWTT',
  },
  {
    id: 'sunstate',
    name: 'SunState',
    facilityId: 'sfmlrFGXYg3aBMdTs4od',
    teamSize: 5,
    expectedDailyOrders: 200,
    slackChannelId: 'C0A1CMH8BK7',
  },
  {
    id: 'astera',
    name: 'Astera Radiology',
    facilityId: 'rf5w1cNTGVfH9ZAJoLCF',
    teamSize: 0,
    expectedDailyOrders: 0,
    slackChannelId: process.env.SLACK_CHANNEL_ASTERA_RADIOLOGY_INTERNAL || '',
  },
];

export const FACILITY_IDS = ORGANIZATIONS.map((org) => org.facilityId);

export function getOrganizationByFacilityId(facilityId: string): Organization | undefined {
  return ORGANIZATIONS.find((org) => org.facilityId === facilityId);
}

export function getOrganizationById(id: string): Organization | undefined {
  return ORGANIZATIONS.find((org) => org.id === id);
}
