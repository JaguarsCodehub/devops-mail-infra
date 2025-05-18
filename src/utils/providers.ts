// src/utils/providers.ts

export type ImapSettings = {
  host: string;
  port: number;
  inboxFolder?: string;
  supportsOAuth2?: boolean;
};

const imapSettingsMap: Record<string, ImapSettings> = {
  'gmail.com': {
    host: 'imap.gmail.com',
    port: 993,
    inboxFolder: 'INBOX',
    supportsOAuth2: true,
  },
  'yahoo.com': {
    host: 'imap.mail.yahoo.com',
    port: 993,
    supportsOAuth2: true,
  },
  'outlook.com': {
    host: 'imap-mail.outlook.com',
    port: 993,
    supportsOAuth2: true,
  },
  'zoho.com': {
    host: 'imap.zoho.com',
    port: 993,
    supportsOAuth2: false,
  },
  'hostinger.com': {
    host: 'imap.hostinger.com',
    port: 993,
    supportsOAuth2: false,
  },
  'bluehost.com': {
    host: 'mail.bluehost.com',
    port: 993,
    supportsOAuth2: false,
  },
  // Add more providers as needed
};

export function getImapSettingsByDomain(
  domain: string
): ImapSettings | undefined {
  return imapSettingsMap[domain.toLowerCase()];
}

// Stubbed for now; implement OAuth2 flow later
export async function useOAuth2IfAvailable(
  domain: string,
  userId: string
): Promise<string | null> {
  if (imapSettingsMap[domain]?.supportsOAuth2) {
    // TODO: Implement token retrieval using saved tokens or refresh tokens
    return null;
  }
  return null;
}
