/**
 * All intervals and limits from config/env. No hardcoding.
 */
import dotenv from 'dotenv';

dotenv.config();

function num(key: string, defaultVal: number): number {
  const v = process.env[key];
  if (v === undefined || v === '') return defaultVal;
  const n = Number(v);
  return Number.isFinite(n) ? n : defaultVal;
}

function float(key: string, defaultVal: number): number {
  const v = process.env[key];
  if (v === undefined || v === '') return defaultVal;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : defaultVal;
}

export const server = {
  port: num('PORT', 4000),
  nodeEnv: process.env.NODE_ENV || 'development',
};

export const redis = {
  url: process.env.REDIS_URL || 'redis://localhost:6379',
};

export const jwt = {
  secret: process.env.JWT_SECRET || 'change-me-in-production-min-32-chars',
  expiresIn: process.env.JWT_EXPIRES_IN || '30d',
};

// --- Drive Discovery & Google API ---

/** Client pings backend every N sec */
export const driveDiscovery = {
  pingIntervalSec: num('PING_INTERVAL_SEC', 10),
  placesRefreshSec: num('PLACES_REFRESH_SEC', 30),
  matrixRefreshSec: num('MATRIX_REFRESH_SEC', 30),
  minGapBetweenStoriesSec: num('MIN_GAP_BETWEEN_STORIES_SEC', 150),
  storyLeadTimeMinDefault: float('STORY_LEAD_TIME_MIN_DEFAULT', 2.0),
  /** Min ETA (sec) to start story — don't start at last second */
  minEtaSecToStart: 20,
  /** Fallback: start by distance (m) when ETA not available */
  fallbackDistanceM: 1200,
};

export const discoveryConfig = {
  pingIntervalSeconds: num('PING_INTERVAL_SECONDS', 10),
  vehicleMinSpeedKmh: num('VEHICLE_MIN_SPEED_KMH', 15),
  walkingMaxSpeedKmh: num('WALKING_MAX_SPEED_KMH', 7),
  vehicleStoryMinSeconds: num('VEHICLE_STORY_MIN_SECONDS', 30),
  vehicleStoryMaxSeconds: num('VEHICLE_STORY_MAX_SECONDS', 45),
  discoveryCooldownSeconds: num('DISCOVERY_COOLDOWN_SECONDS', 150),
  antiRepeatHours: num('ANTI_REPEAT_HOURS', 24),
  gpsStaleSeconds: num('GPS_STALE_SECONDS', 20),
  headingGraceSeconds: num('HEADING_GRACE_SECONDS', 20),
  nearbyCacheTtlSeconds: num('NEARBY_CACHE_TTL_SECONDS', 180),
  etaCacheTtlSeconds: num('ETA_CACHE_TTL_SECONDS', 120),
};

/** Speed (km/h) below which we don't consider "vehicle" */
export const speedThresholds = {
  minVehicleKmh: num('MIN_VEHICLE_SPEED_KMH', 15),
  /** Speed buckets for refresh rate: 20-40, 40-80, 80+ */
  lowKmh: 40,
  midKmh: 80,
};

/** Distance ahead (m) for POI search by speed bucket */
export const distanceAhead = {
  lowM: num('DISTANCE_AHEAD_LOW_M', 800),
  midM: num('DISTANCE_AHEAD_MID_M', 1500),
  highM: num('DISTANCE_AHEAD_HIGH_M', 2500),
};

/** Nearby Search radius (m) */
export const placesRadius = {
  aheadM: num('PLACES_RADIUS_AHEAD_M', 1200),
  currentM: num('PLACES_RADIUS_CURRENT_M', 500),
};

export const poi = {
  /** Max destinations in one Distance Matrix request */
  kDestinations: num('K_DESTINATIONS', 6),
  minRating: float('POI_MIN_RATING', 4.2),
  minUserRatingsTotal: num('POI_MIN_USER_RATINGS_TOTAL', 250),
  /** Don't re-request Matrix for same destinations within this movement (m) */
  matrixDedupeMovementM: num('MATRIX_DEDUPE_MOVEMENT_M', 500),
  /** Don't re-tell same POI within 24h */
  repeatCooldownHours: num('POI_REPEAT_COOLDOWN_HOURS', 24),
};

/** Budget: max Google API calls per user per minute */
export const budget = {
  maxGoogleCallsPerMinutePerUser: num('MAX_GOOGLE_CALLS_PER_MINUTE_PER_USER', 6),
  maxPlacesCallsPerMinutePerUser: num('MAX_PLACES_CALLS_PER_MINUTE_PER_USER', 2),
  maxMatrixCallsPerMinutePerUser: num('MAX_MATRIX_CALLS_PER_MINUTE_PER_USER', 2),
};

/** Circuit breaker: disable Drive Discovery for N sec after Google 429 */
export const circuitBreaker = {
  openSec: num('CIRCUIT_BREAKER_OPEN_SEC', 60),
};

/** Cache TTL (seconds) */
export const cacheTtl = {
  nearbyPlacesSec: num('CACHE_NEARBY_PLACES_SEC', 180),
  matrixSec: num('CACHE_MATRIX_SEC', 120),
  placeDetailsDays: num('CACHE_PLACE_DETAILS_DAYS', 30),
  storyTextDays: num('CACHE_STORY_TEXT_DAYS', 30),
  ttsAudioDays: num('CACHE_TTS_AUDIO_DAYS', 30),
};

/** Allowed place types for Drive Discovery (noise filtered out) */
export const placeTypes = {
  allowed: [
    'tourist_attraction',
    'museum',
    'park',
    'church',
    'synagogue',
    'hindu_temple',
    'mosque',
    'art_gallery',
    'stadium',
    'university',
    'city_hall',
    'library',
  ],
  forbidden: [
    'gas_station',
    'convenience_store',
    'atm',
    'parking',
    'car_wash',
    'bank',
    'store',
  ],
};

export const googleMaps = {
  apiKey: process.env.GOOGLE_MAPS_API_KEY || '',
};

export const narration = {
  lengthSecMin: 30,
  lengthSecMax: 180,
  lengthSecDefault: 90,
  leadTimeMinMin: 0.5,
  leadTimeMinMax: 6,
};

export const themeTags = [
  'history',
  'architecture',
  'cinema_culture',
  'food_coffee',
  'religion',
  'engineering_infrastructure',
  'mixed',
] as const;

export const narrationStyles = [
  'documentary',
  'light_ironic',
  'detective',
  'romantic',
  'tech',
  'mini_lecture',
] as const;

export type ThemeTag = (typeof themeTags)[number];
export type NarrationStyle = (typeof narrationStyles)[number];
