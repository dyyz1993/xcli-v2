export interface DetectionResult {
  type: 'captcha' | 'popup' | 'block' | 'error' | null;
  severity: 'low' | 'medium' | 'high';
  message: string;
  details: string[];
  suggestions: string[];
  meta?: {
    captchaId?: string;
    captchaType?: string;
    elementCount?: number;
    selectors?: string[];
    images?: number;
  };
}

export interface PageAnalysis {
  html: string;
  url: string;
  title: string;
  elements?: {
    inputs: number;
    images: number;
    buttons: number;
    forms: number;
  };
}
