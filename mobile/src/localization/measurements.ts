import type { MeasurementUnits, SupportedLocale } from './preferences';

/** Display boundary only: all inputs remain metres and km/h. */
export function createMeasurementFormatter(units: MeasurementUnits, locale: SupportedLocale) {
  const number = (value: number, decimals: number) => new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  }).format(value);
  const labels = locale === 'ru' ? { m: 'м', km: 'км', kmh: 'км/ч' } : { m: 'm', km: 'km', kmh: 'km/h' };
  return {
    distance(metres: number | null | undefined): string {
      if (typeof metres !== 'number' || !Number.isFinite(metres) || metres < 0) return '—';
      if (units === 'imperial') {
        return metres < 160.9344 ? `${number(Math.round(metres / 0.3048 / 10) * 10, 0)} ft`
          : `${number(metres / 1609.344, 1)} mi`;
      }
      return metres < 1000 ? `${number(Math.round(metres / 10) * 10, 0)} ${labels.m}`
        : `${number(metres / 1000, 1)} ${labels.km}`;
    },
    speed(kmh: number | null | undefined): string {
      if (typeof kmh !== 'number' || !Number.isFinite(kmh) || kmh < 0) return '—';
      return units === 'imperial' ? `${number(kmh / 1.609344, 1)} mph` : `${number(kmh, 1)} ${labels.kmh}`;
    },
  };
}
