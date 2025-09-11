export const LEAP_CASES = [
  { input: 1996, expected: true },
  { input: 1997, expected: false },
  { input: 1900, expected: false },
  { input: 2000, expected: true },
  { input: 2400, expected: true },
  { input: 1800, expected: false },
  { input: 2024, expected: true },
  { input: 2100, expected: false },
  { input: 2019, expected: false },
  { input: 2016, expected: true }
];

