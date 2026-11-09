const URL_PATTERN = /https?:\/\/\S+/g;

// Servers count every link as a fixed number of characters.
export function countCharacters(text: string, perUrl: number) {
  return Array.from(text.replace(URL_PATTERN, 'x'.repeat(perUrl))).length;
}
