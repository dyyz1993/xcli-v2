export type EventType =
  | 'click'
  | 'dblclick'
  | 'contextmenu'
  | 'mousedown'
  | 'mouseup'
  | 'mousemove'
  | 'hover_enter'
  | 'hover_leave'
  | 'scroll'
  | 'keydown'
  | 'keyup'
  | 'keypress'
  | 'input'
  | 'change'
  | 'focus'
  | 'blur'
  | 'select'
  | 'drag_start'
  | 'drag_end'
  | 'drop'
  | 'file_upload'
  | 'navigation'
  | 'page_load'
  | 'hash_change'
  | 'class_change'
  | 'element_show'
  | 'element_hide'
  | 'popup_show'
  | 'popup_hide'
  | 'attribute_change'
  | 'dom_node_added'
  | 'dom_node_removed'
  | 'submit'
  | 'form_reset'
  | 'media_play'
  | 'media_pause'
  | 'media_ended'
  | 'media_seek'
  | 'touchstart'
  | 'touchend'
  | 'touchmove'
  | 'swipe_left'
  | 'swipe_right'
  | 'swipe_up'
  | 'swipe_down'
  | 'window_resize'
  | 'dropdown_open'
  | 'dropdown_close'
  | 'wait'
  | 'assert'
  | 'tab_open';

export type WaitType =
  | 'element_visible'
  | 'element_hidden'
  | 'element_attached'
  | 'element_detached'
  | 'text_present'
  | 'text_gone'
  | 'url_match'
  | 'page_load'
  | 'network_idle'
  | 'timeout';

export type AssertType =
  | 'element_exists'
  | 'element_visible'
  | 'element_hidden'
  | 'text_equals'
  | 'text_contains'
  | 'value_equals'
  | 'url_equals'
  | 'url_contains'
  | 'attribute_equals';

export type NavigationSource =
  | 'cdp'
  | 'js'
  | 'link'
  | 'form'
  | 'script'
  | 'history'
  | 'pushState'
  | 'replaceState';

export interface EventData {
  x?: number;
  y?: number;
  clientX?: number;
  clientY?: number;
  button?: number;
  scrollX?: number;
  scrollY?: number;
  scrollTarget?: string;
  key?: string;
  code?: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  value?: string;
  checked?: boolean;
  files?: string[];
  url?: string;
  navigationType?: NavigationSource;
  source?: NavigationSource;
  persisted?: boolean;
  oldURL?: string;
  newURL?: string;
  hash?: string;
  state?: string;
  addedClasses?: string[];
  removedClasses?: string[];
  matchedClasses?: string[];
  visibility?: 'visible' | 'hidden';
  display?: string;
  popupType?: 'popup' | 'modal' | 'drawer' | 'tooltip';
  trigger?: string;
  attributeName?: string;
  oldValue?: string;
  newValue?: string;
  parentSelector?: string;
  nodeName?: string;
  formSelector?: string;
  method?: string;
  action?: string;
  currentTime?: number;
  duration?: number;
  muted?: boolean;
  touches?: Array<{ x: number; y: number }>;
  points?: Array<{ x?: number; y?: number; delay?: number }>;
  direction?: 'left' | 'right' | 'up' | 'down';
  width?: number;
  height?: number;
  selectedValue?: string;
  selectedIndex?: number;
  openerUrl?: string;
  isTrajectory?: boolean;
}

export interface WaitCondition {
  type: WaitType;
  selector?: string;
  text?: string;
  url?: string;
  timeout?: number;
}

export interface AssertCondition {
  type: AssertType;
  selector?: string;
  expected?: unknown;
  actual?: unknown;
  message?: string;
}

export interface PageState {
  url: string;
  title: string;
  readyState: string;
}

export interface RecordedEvent {
  id: string;
  type: EventType;
  timestamp: number;
  selector?: string;
  xpath?: string;
  tagName?: string;
  text?: string;
  data: EventData;
  waitBefore?: WaitCondition[];
  assertAfter?: AssertCondition[];
  pageState?: PageState;
}

export interface RecordingMetadata {
  browser: string;
  os: string;
  userAgent: string;
  recordedAt: string;
}

export interface RecordingSession {
  id: string;
  name?: string;
  startTime: number;
  endTime?: number;
  duration: number;
  startUrl: string;
  viewport: {
    width: number;
    height: number;
  };
  events: RecordedEvent[];
  metadata: RecordingMetadata;
}

export interface PlaybackOptions {
  slowMo?: number;
  noDelay?: boolean;
  stopOnError?: boolean;
  onProgress?: (info: { current: number; total: number; event: RecordedEvent }) => void;
}

export interface PlaybackError {
  eventIndex: number;
  event: RecordedEvent;
  error: string;
}

export interface PlaybackResult {
  success: boolean;
  duration: number;
  eventsPlayed: number;
  totalEvents: number;
  errors: PlaybackError[];
}

export interface RecorderStatus {
  isRecording: boolean;
  eventCount: number;
  duration: number;
}
