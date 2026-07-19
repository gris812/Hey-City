export const explorationModes = ['city_explorer', 'guided_tour', 'drive_discovery'] as const;
export type ExplorationMode = (typeof explorationModes)[number];

export const defaultExplorationMode: ExplorationMode = 'city_explorer';

export type JourneyState =
  | 'idle'
  | 'exploring'
  | 'approaching'
  | 'arrived'
  | 'narrating'
  | 'paused'
  | 'waiting_to_continue'
  | 'moving_to_next_target'
  | 'completed'
  | 'holding'
  | 'error';
