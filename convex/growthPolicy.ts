// Conservative source gate shared by the trusted model gateway and durable mutations.
export function sourcePolicy(text: string) {
  return {
    unsupported:
      /\b(pdf|export\w*|sync\w*|collaborat\w*|shared albums?)\b/i.test(text),
    explicit:
      /\b(anyone|recommend\w*|looking for|is there|suggest\w*|help me|any app|app.*(?:find|search)|need.*(?:find|search))\b/i.test(
        text,
      ),
    matched:
      /\b(caption\w*|search\w*|find|finding)\b/i.test(text) &&
      /\b(journal\w*|memor\w*|photo\w*|diary|written|wrote)\b/i.test(text),
  };
}
