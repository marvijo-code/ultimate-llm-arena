export interface IsogramCase {
  input: string;
  expected: boolean;
  description: string;
}

// Canonical-style cases adapted from Exercism (javascript/isogram)
export const ISOGRAM_CASES: IsogramCase[] = [
  { input: "", expected: true, description: "empty string" },
  { input: "isogram", expected: true, description: "isogram with only lower case characters" },
  { input: "eleven", expected: false, description: "word with one duplicated character" },
  { input: "subdermatoglyphic", expected: true, description: "longest reported english isogram" },
  { input: "Alphabet", expected: false, description: "word with duplicated character in mixed case" },
  { input: "thumbscrew-japingly", expected: true, description: "hypothetical isogrammic word with hyphen" },
  { input: "Hjelmqvist-Gryb-Zock-Pfund-Wax", expected: true, description: "isogram with duplicated hyphen" },
  { input: "Heizölrückstoßabdämpfung", expected: true, description: "german phrase with umlauts and accents treated as distinct" },
  { input: "Emily Jung Schwartzkopf", expected: true, description: "isogram with spaces" },
  { input: "accentor", expected: false, description: "repeated letter with accent considered same base letter? keep strict by rune" },
  { input: "angola", expected: false, description: "regular word not isogram" },
  { input: "six-year-old", expected: true, description: "another hyphenated isogram" },
  { input: "background", expected: true, description: "classic isogram" },
  { input: "downstream", expected: true, description: "another isogram" },
  { input: "upstream", expected: true, description: "another isogram 2" }
];

