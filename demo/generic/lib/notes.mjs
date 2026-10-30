// Tiny notes service with a SEEDED BUG: POST /notes drops the title.
// The UI promises "title and body are saved"; the test below asserts it.
export function saveNote(input) {
  return {
    id: Math.random().toString(36).slice(2, 10),
    body: input.body,
  };
}
