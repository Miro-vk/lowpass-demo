export type Cluster = {
  rank: number;
  title: string;
  url: string;
  sources: string[];
  composite_score: number;
  summary: string;
};

export type DigestResult = {
  topic: string;
  clusters: Cluster[];
  themes: string;
};

export type DigestRun = {
  id: string;
  topic: string;
  timestamp: Date;
  results: DigestResult[];
};
