export interface GameDate {
  day: number;
  hour: number;
  minute: number;
}

export interface WorldArea {
  sector: string;
  arena: string;
  x: number;
  y: number;
}

export interface AgentView {
  id: string;
  name: string;
  position: { x: number; y: number };
  currentAction: string | null;
  inConversation: boolean;
}

export interface ObjectView {
  name: string;
  arena: string;
  x: number;
  y: number;
}

export interface ConversationView {
  participants: string[];
}

export interface SensoryInput {
  currentLocation: WorldArea;
  visibleAgents: AgentView[];
  visibleObjects: ObjectView[];
  visibleConversations: ConversationView[];
}

export type PerceivedEventKind = 'agent_action' | 'conversation' | 'object' | 'self';

export interface PerceivedEvent {
  kind: PerceivedEventKind;
  subject: string;
  predicate: string;
  object: string | null;
  description: string;
  focalPoints: string[];
  at: GameDate;
}
