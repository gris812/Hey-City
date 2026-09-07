export type AITaskKind =
  | 'final_storytelling'
  | 'complex_follow_up'
  | 'evidence_compression'
  | 'poi_normalization'
  | 'relevance_classification';

export interface GenerativeTaskRequest {
  task: AITaskKind;
  instructions: string;
  input: string;
  userId?: string;
}

export interface GenerativeTaskResult {
  text: string;
  providerId: string;
  model: string;
}

export interface GenerativeProvider {
  readonly id: string;
  supports(task: AITaskKind): boolean;
  generate(request: GenerativeTaskRequest): Promise<GenerativeTaskResult>;
}
