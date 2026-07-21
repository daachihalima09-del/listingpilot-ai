export type PipelineStage = 'input' | 'extract' | 'verify' | 'generate' | 'review' | 'export';

export type TruthStatus = 'Verified' | 'Conflict' | 'Likely' | 'Missing';

export interface TruthRow {
  field: string;
  value: string;
  source: string;
  sourcesCount: number;
  confidence: number;
  status: TruthStatus;
  reasoning?: string;
}

export interface SourceEvidenceItem {
  name: string;
  type: string;
  confidence: number;
  status: 'Official' | 'Retailer' | 'Review';
}

export interface DemoProduct {
  brand: string;
  model: string;
  panel: string;
  hdr: string;
  refreshRate: string;
  resolution: string;
  smartPlatform: string;
  warranty: string;
  truthRows: TruthRow[];
  sources: SourceEvidenceItem[];
  conflict: {
    label: string;
    official: string;
    amazon: string;
    lg: string;
    recommendation: string;
    recommendedValue: string;
    explanation: string;
  };
  catalogHealth: {
    score: number;
    label: string;
    items: Array<{ name: string; status: 'good' | 'warning' | 'review' }>;
  };
  analyses: Array<{ title: string; status: string; score: number }>;
}
