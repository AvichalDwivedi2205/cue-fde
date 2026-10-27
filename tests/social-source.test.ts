import { describe, expect, test } from "vitest";
import { socialSource } from "../lib/social-source";
describe("Social capture provenance", () => {
  test("X tracking links deduplicate by post and normalize the source", () => {
    expect(
      socialSource("x", "https://twitter.com/customer/status/123456?s=20"),
    ).toEqual({ key: "x:123456", url: "https://x.com/customer/status/123456" });
  });
  test("Reddit comments stay separate from their parent post and survive host changes", () => {
    const post = socialSource(
      "reddit",
      "https://www.reddit.com/r/bloom/comments/abc123/feedback/",
    );
    const comment = socialSource(
      "reddit",
      "https://old.reddit.com/r/bloom/comments/abc123/feedback/def456/?context=3",
    );
    expect(post.key).toBe("reddit:post:abc123");
    expect(comment.key).toBe("reddit:comment:def456");
    expect(
      socialSource(
        "reddit",
        "https://www.reddit.com/r/bloom/comments/abc123/feedback/def456/",
      ).key,
    ).toBe(comment.key);
  });
  test("rejects foreign hosts, credentials, insecure URLs and non-post links", () => {
    for (const url of [
      "https://reddit.com.evil.example/r/bloom/comments/abc123/title/",
      "https://user:pass@reddit.com/r/bloom/comments/abc123/title/",
      "http://reddit.com/r/bloom/comments/abc123/title/",
      "https://reddit.com/user/example/",
    ])
      expect(() => socialSource("reddit", url)).toThrow();
    expect(() => socialSource("x", "https://x.com/home")).toThrow();
  });
});
