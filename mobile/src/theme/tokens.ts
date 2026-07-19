export const colors = {
  background: '#F8F6F2',
  foreground: '#1F1F1F',
  surface: '#FFFFFF',
  surfaceMuted: '#F3F0EA',
  border: '#DADADA',
  textMuted: '#6E6E73',
  primaryOrange: '#FF6B2C',
  primaryOrangePressed: '#E95A20',
  primaryOrangeLight: '#FFF1E8',
  locationBlue: '#2F80ED',
  routeCompleted: '#B8B8B8',
  dana: '#D6C3A3',
  arthur: '#6B8CA3',
  warning: '#C6922D',
  danger: '#EB5757',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  pill: 999,
} as const;

export const typography = {
  title: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '600',
  },
  body: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '400',
  },
  label: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400',
  },
} as const;

export const shadows = {
  floating: {
    shadowColor: '#1C1C1E',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 5,
  },
  subtle: {
    shadowColor: '#1C1C1E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 2,
  },
} as const;
