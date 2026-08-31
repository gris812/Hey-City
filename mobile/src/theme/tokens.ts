const brandGreen = '#0F7A3F';
const brandGreenPressed = '#0A6233';
const brandGreenSoft = '#E6F4EA';

export const colors = {
  background: '#F8FAF7',
  foreground: '#0B1711',
  surface: '#FFFFFF',
  surfaceMuted: '#F1F6F2',
  border: '#D8E5DB',
  textMuted: '#66736B',
  primary: brandGreen,
  primaryPressed: brandGreenPressed,
  primaryBright: '#22C55E',
  primarySoft: brandGreenSoft,
  /** @deprecated Migrate touched components to semantic primary tokens. */
  primaryOrange: brandGreen,
  /** @deprecated Migrate touched components to semantic primary tokens. */
  primaryOrangePressed: brandGreenPressed,
  /** @deprecated Migrate touched components to semantic primary tokens. */
  primaryOrangeLight: brandGreenSoft,
  locationBlue: '#2F80ED',
  routeCompleted: '#A9B5AC',
  dana: brandGreen,
  arthur: '#6B8CA3',
  warning: '#B97818',
  danger: '#C33E3E',
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
    shadowColor: '#102518',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 5,
  },
  subtle: {
    shadowColor: '#102518',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 2,
  },
} as const;
