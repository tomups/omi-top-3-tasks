export interface TranscriptSegment {
  text: string;
  speaker: string;
  speaker_id: number;
  is_user: boolean;
  person_id: string | null;
  start: number;
  end: number;
}

export interface ActionItem {
  description: string;
  completed: boolean;
  deleted: boolean;
}

export interface StructuredData {
  title: string;
  overview: string;
  emoji: string;
  category: string;
  action_items: ActionItem[];
  events: any[];
}

export interface PluginResult {
  plugin_id: string;
  content: string;
}

export interface Memory {
  id: string;
  created_at: string;
  started_at: string;
  finished_at: string;
  source: string;
  language: string;
  structured: StructuredData;
  transcript_segments: TranscriptSegment[];
  geolocation: any | null;
  photos: any[];
  plugins_results: PluginResult[];
  external_data: any | null;
  discarded: boolean;
  deleted: boolean;
  visibility: string;
  processing_memory_id: string | null;
  status: string;
}

export interface TranscriptSession {
  segments: TranscriptSegment[];
  session_id: string;
}
