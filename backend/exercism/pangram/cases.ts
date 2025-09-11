export const PANGRAM_CASES = [
  { input: "the quick brown fox jumps over the lazy dog", expected: true },
  { input: "The quick brown fox jumps over the lazy dog", expected: true },
  { input: "a quick movement of the enemy will jeopardize five gunboats", expected: false },
  { input: "Sphinx of black quartz, judge my vow", expected: true },
  { input: "not a pangram", expected: false },
  { input: "abcdefghijklmnopqrstuvwxyz", expected: true },
  { input: "abcdefghijklmnopqrstuvwxys", expected: false },
  { input: "", expected: false },
  { input: "Cwm fjord bank glyphs vext quiz", expected: true },
  { input: "Pack my box with five dozen liquor jugs", expected: true }
];

