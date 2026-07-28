
export interface TestCase {
  title: string;
  description: string;
  priority: 'High' | 'Medium' | 'Low' | 'Urgent';
}

export interface ClickUpResult {
  success: boolean;
  message: string;
  clickUpId?: string;
}

export interface SyncResult {
  success: boolean;
  message: string;
  id?: string;
  url?: string;
}

export type IntegrationTarget = 'huly' | 'clickup';

export interface AutomationCode {
  stepDefinition: string;
  pageObject: string;
}

export interface Attachment {
  name: string;
  data: string;
  mimeType: string;
}
