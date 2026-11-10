import type { Currency, GeneralPreferences, WeekStart } from './types';

const currencySymbols: Record<Currency, string> = {
  BRL: 'R$',
  EUR: '€',
  GBP: '£',
  USD: '$',
};

const currencyLocales: Record<Currency, string> = {
  BRL: 'pt-BR',
  EUR: 'en-IE',
  GBP: 'en-GB',
  USD: 'en-US',
};

const currencyLabels: Record<Currency, string> = {
  BRL: 'BRL — Brazilian Real',
  EUR: 'EUR — Euro',
  GBP: 'GBP — British Pound',
  USD: 'USD — US Dollar',
};

export const currencyOptions: Currency[] = ['EUR', 'USD', 'GBP', 'BRL'];

export const formatCurrencyOption = (currency: Currency): string =>
  `${currencyLabels[currency]} (${currencySymbols[currency]})`;

export const convertFromUsd = (
  amountUsd: number,
  currency: Currency,
  fxRatePerUsd: GeneralPreferences['fxRatePerUsd']
): number => {
  if (currency === 'USD') return amountUsd;
  const rate = fxRatePerUsd[currency] ?? 1;
  return amountUsd * rate;
};

export const formatMoney = (
  amountUsd: number,
  general: GeneralPreferences
): string => {
  const converted = convertFromUsd(amountUsd, general.currency, general.fxRatePerUsd);
  return new Intl.NumberFormat(currencyLocales[general.currency], {
    currency: general.currency,
    maximumFractionDigits: Math.abs(converted) < 10 ? 2 : 0,
    style: 'currency',
  }).format(converted);
};

export const formatMoneyNative = (amount: number, currency: string): string => {
  const code = currency || 'USD';
  return new Intl.NumberFormat(currencyLocales[code as Currency] ?? 'en-US', {
    currency: code,
    maximumFractionDigits: Math.abs(amount) < 10 ? 2 : 0,
    style: 'currency',
  }).format(amount);
};

export const formatMoneyDual = (
  amountUsd: number,
  general: GeneralPreferences
): { converted: string; original: string } => ({
  converted: formatMoney(amountUsd, general),
  original: new Intl.NumberFormat('en-US', {
    currency: 'USD',
    maximumFractionDigits: Math.abs(amountUsd) < 10 ? 2 : 0,
    style: 'currency',
  }).format(amountUsd),
});

const titleCase = (input: string): string =>
  input
    .split(/[-_\s]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');

const optionOverrides: Record<string, string> = {
  '5h-window': '5-hour rolling window',
  all: 'All',
  csv: 'CSV',
  day: 'Day',
  json: 'JSON',
  monthly: 'Monthly',
  month: 'Month',
  week: 'Week',
  weekly: 'Weekly',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  plan: 'AI Plan Control',
  router: 'Router Lab',
  productivity: 'Productivity',
  finance: 'Finance',
  sources: 'Sources',
  apiProxy: 'API proxy',
  tokensPerTurn: 'Tokens / turn',
  Claude: 'Claude',
  Codex: 'Codex',
};

export const formatOption = (raw: string): string => {
  if (raw in optionOverrides) return optionOverrides[raw];
  return titleCase(raw);
};

export const formatWeekStart = (start: WeekStart): string =>
  start === 'monday' ? 'Monday' : 'Sunday';

const accentRamp = (hex: string): Record<string, string> => ({
  '--accent': hex,
});

export const applyAccent = (hex: string): void => {
  if (typeof document === 'undefined') return;
  for (const [key, value] of Object.entries(accentRamp(hex))) {
    document.documentElement.style.setProperty(key, value);
  }
};
