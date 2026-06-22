export interface SpreadsheetRow {
  id: string;
  category: string;
  url: string;
  username: string;
  password: string;
  requiresLogin: boolean;
  lastScreenshotTime: string | null;
  lastScreenshotUrl: string | null;
  status: 'idle' | 'pending' | 'success' | 'failed';
  error?: string;
}

export interface ScreenshotFile {
  id: string;
  rowId: string;
  category: string;
  url: string;
  timestamp: string;
  imageUrl: string;
  filename: string;
  usernameUsed?: string;
  isRealScreenshot?: boolean;
}

export interface DashboardStats {
  totalLinks: number;
  loginRequiredCount: number;
  totalScreenshots: number;
  successRate: number;
}
