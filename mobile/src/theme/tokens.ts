export const colors = {
  background: '#F8F5EE',
  foreground: '#1C1C1E',
  surface: '#FFFDF8',
  surfaceMuted: '#F1ECE3',
  border: '#DED7CB',
  textMuted: '#77736D',
  dana: '#D6C3A3',
  arthur: '#6B8CA3',
  warning: '#B87926',
  danger: '#B5413C',
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
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
  },
  body: {
    fontSize: 15,
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
