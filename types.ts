
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

export interface AutomationCode {
  stepDefinition: string;
  pageObject: string;
}

export interface Attachment {
  name: string;
  data: string;
  mimeType: string;
}
