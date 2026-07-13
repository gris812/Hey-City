const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';

export const config = {
  apiBase: API_BASE,
  pingIntervalSec: 10,
};
