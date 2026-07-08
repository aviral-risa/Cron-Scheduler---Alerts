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

/** Astera Radiology — radiology-cron.yml only */
export const ASTERA_ORG_ID = 'astera';
export const ASTERA_FACILITY_ID = 'rf5w1cNTGVfH9ZAJoLCF';

/**
 * MedOnc cron scope: all orgs except Astera, or exactly one when MEDONC_ORG_ID is set.
 * Set MEDONC_ORG_ID=nycbs (etc.) in MEDONC_ENV_FILE for single-org plug-and-play deploys.
 */
export function getMedOncOrganizations(): Organization[] {
  const medoncOrgs = ORGANIZATIONS.filter((o) => o.id !== ASTERA_ORG_ID);
  const orgId = process.env.MEDONC_ORG_ID?.trim().toLowerCase();
  if (!orgId) {
    return medoncOrgs;
  }
  const org = medoncOrgs.find((o) => o.id === orgId);
  if (!org) {
    throw new Error(
      `MEDONC_ORG_ID '${orgId}' not found. Available: ${medoncOrgs.map((o) => o.id).join(', ')}`
    );
  }
  return [org];
}

export function getMedOncFacilityIds(): string[] {
  return getMedOncOrganizations().map((org) => org.facilityId);
}

export function getRadiologyOrganizations(): Organization[] {
  const org = ORGANIZATIONS.find((o) => o.id === ASTERA_ORG_ID);
  return org ? [org] : [];
}

export function getOrganizationByFacilityId(facilityId: string): Organization | undefined {
  return ORGANIZATIONS.find((org) => org.facilityId === facilityId);
}

export function getOrganizationById(id: string): Organization | undefined {
  return ORGANIZATIONS.find((org) => org.id === id);
}
