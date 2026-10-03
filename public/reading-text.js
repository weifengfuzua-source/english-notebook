// Shared by build validation and rendering: repeated text identifies its occurrence.
export function annotationStart(english, annotation) {
  const occurrence = annotation.occurrence ?? 1;
  if (!Number.isInteger(occurrence) || occurrence < 1 || !annotation.text) return -1;
  let cursor = -1;
  for (let count = 0; count < occurrence; count++) {
    cursor = english.indexOf(annotation.text, cursor + 1);
    if (cursor < 0) return -1;
  }
  return cursor;
}
