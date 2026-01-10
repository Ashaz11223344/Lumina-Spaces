
export enum AppState {
  UPLOAD = 'UPLOAD',
  EDITOR = 'EDITOR',
  GENERATING = 'GENERATING',
  RESULTS = 'RESULTS'
}

export enum RoomType {
  BEDROOM = 'Bedroom',
  LIVING_ROOM = 'Living Room / Hall',
  KITCHEN = 'Kitchen',
  BATHROOM = 'Bathroom',
  OFFICE = 'Office',
  DINING_ROOM = 'Dining Room',
  BALCONY = 'Balcony',
  STUDIO = 'Studio',
  OUTDOOR = 'Outdoor Area',
  CUSTOM = 'Custom Room Type'
}

export enum StylePreset {
  MODERN = 'Modern',
  SCANDINAVIAN = 'Scandinavian',
  JAPANDI = 'Japandi',
  MID_CENTURY = 'Mid-century',
  MINIMAL_TRADITIONAL = 'Minimal Traditional',
  INDUSTRIAL = 'Industrial',
  BOHEMIAN = 'Bohemian'
}

export enum LightingOption {
  DAYLIGHT = 'Daylight',
  WARM_INDOOR = 'Warm indoor',
  GOLDEN_HOUR = 'Golden hour',
  NEUTRAL = 'Neutral'
}

export enum Gender {
  MALE = 'Male',
  FEMALE = 'Female',
  NEUTRAL = 'Neutral'
}

export enum AvatarStyle {
  AVATAAARS = 'avataaars',
  LORELEI = 'lorelei',
  BOTTTS = 'bottts',
  NOTIONISTS = 'notionists',
  PIXEL_ART = 'pixel-art'
}

export interface SavedPreset {
  id: string;
  name: string;
  roomType: RoomType;
  style: StylePreset;
  lighting: LightingOption;
  creativity: number;
  prompt: string;
}

export interface UserPreferences {
  defaultRoomType: RoomType;
  defaultStyle: StylePreset;
  defaultLighting: LightingOption;
  savedPresets: SavedPreset[];
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatar: string;
  avatarStyle: AvatarStyle;
  isPro: boolean;
  joinedAt: number;
  gender: Gender;
  preferences: UserPreferences;
}

export interface GenerationSettings {
  prompt: string;
  roomType: RoomType;
  style: StylePreset;
  lighting: LightingOption;
  creativity: number; // 0-100
  preserveStructure: boolean;
  autoSuggest: boolean;
}

export interface GenerationResult {
  id: string;
  imageUrl: string;
  depthMapUrl?: string;
  promptUsed: string;
  timestamp: number;
  sourceImage: string;
  settings: GenerationSettings;
}

export interface DesignSuggestion {
  id: string;
  text: string;
  category: 'decor' | 'lighting' | 'furniture' | 'color';
  box_2d?: [number, number, number, number]; // [ymin, xmin, ymax, xmax] normalized 0-1000
}

export interface ProductItem {
  id: string;
  name: string;
  query: string;
  category: string;
  priceRange?: string;
}

export interface BudgetItem {
  id: string;
  item: string;
  costMin: number;
  costMax: number;
  category: string;
}
