export interface A11yNode {
  role?: string;
  name?: string;
  tag: string;
  selector?: string;
  href?: string;
  disabled?: boolean;
  children?: A11yNode[];
}

export interface LayoutNode {
  type: string;
  selector?: string;
  xpath?: string;
  region?: string;
  keywords?: string[];
  role?: string;
  hasForm?: boolean;
  hasSearch?: boolean;
  inputCount?: number;
  buttonCount?: number;
  linkCount?: number;
  repeatCount?: number;
  isHidden?: boolean;
  isActive?: boolean;
  size?: string;
  a11ySize?: string;
  children?: LayoutNode[];
}

export interface ExtractResult<T> {
  json: T | null;
  yaml: string;
  size: {
    html: number;
    extracted: number;
  };
}
