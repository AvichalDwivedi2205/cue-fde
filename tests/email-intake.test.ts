import { describe, expect, test } from "vitest";
import { normalizeEmail, type ReceivedEmail } from "../lib/email-intake";

const mention: ReceivedEmail = {
  id: "receipt-x",
  from: "X <notify@x.com>",
  subject: "Alice mentioned you",
  html: '<table><tr><td><p>@bloomapp my 3 MB photo upload fails</p><a href="https://twitter.com/alice/status/123456?s=20&amp;ref=email">View post</a></td></tr></table>',
};
describe("Notification email intake", () => {
  test("notification import requires opt-in", () => {
    const report = normalizeEmail(mention).reports[0];
    expect(report.channel).toBe("email");
    expect(report.customer).toBe("notify@x.com");
    expect(report.body).toContain("3 MB photo upload fails");
    expect(report.messageKey).toBeUndefined();
  });
  test("X HTML notifications retain excerpts, direct links and unverified identity", () => {
    const report = normalizeEmail(mention, true).reports[0];
    expect(report).toMatchObject({
      channel: "x",
      transport: "notification_email",
      sourceKey: "x:123456",
      sourceUrl: "https://x.com/alice/status/123456",
      customer: "@alice (unverified)",
      eventKey: "email-notification:receipt-x:x:123456",
    });
    expect(report.body).toContain("3 MB photo upload fails");
    expect(report.body).toContain("full post was not fetched");
    expect(report.body).not.toContain("<table>");
  });
  test("multi-post digests keep per-post context and repeated links appear once", () => {
    const reports = normalizeEmail(
      {
        ...mention,
        subject: "New notifications",
        html: '<ul><li>3 MB upload fails <a href="https://x.com/alice/status/123456">View</a><a href="https://twitter.com/alice/status/123456?s=email">Again</a></li><li>Please add dark mode <a href="https://x.com/bob/status/789012">View</a></li></ul>',
      },
      true,
    ).reports;
    expect(reports).toHaveLength(2);
    expect(reports[0].body).toContain("3 MB upload fails");
    expect(reports[0].body).not.toContain("dark mode");
    expect(reports[1].body).toContain("dark mode");
    expect(reports[1].body).not.toContain("3 MB upload fails");
    expect(new Set(reports.map((r) => r.eventKey)).size).toBe(2);
    expect(reports.every((r) => r.messageKey === undefined)).toBe(true);
  });
  test("Reddit comments use their permalink identity rather than the parent post", () => {
    const reports = normalizeEmail(
      {
        ...mention,
        from: "Reddit <noreply@redditmail.com>",
        subject: "u/alice mentioned you",
        html: null,
        text: "u/bloom_support photo upload fails\nhttps://old.reddit.com/r/bloom/comments/abc123/help/def456/?context=3",
      },
      true,
    ).reports;
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      channel: "reddit",
      sourceKey: "reddit:comment:def456",
      customer: "Reddit author unverified",
    });
    expect(reports[0].body).toContain("photo upload fails");
  });
  test("newsletters and account security mail are excluded from social intake", () => {
    for (const subject of [
      "Your account verification code",
      "Reset password",
      "Recommended for you",
    ])
      expect(
        normalizeEmail({ ...mention, subject }, true).reports,
      ).toHaveLength(0);
  });
  test("tracking-only notifications require manual review and are never fetched", () => {
    const result = normalizeEmail(
      {
        ...mention,
        html: '<p>Someone mentioned you <a href="https://t.co/redirect">View</a></p>',
      },
      true,
    );
    expect(result.reports).toHaveLength(0);
    expect(result.ignored).toContain("capture it manually");
  });
  test("ordinary support emails containing social links stay email conversations", () => {
    const report = normalizeEmail(
      {
        ...mention,
        from: "Alice <alice@example.com>",
        subject: "Here is my report",
      },
      true,
    ).reports[0];
    expect(report.channel).toBe("email");
    expect(report.customer).toBe("alice@example.com");
  });
  test("host impersonation, credentials, hidden links and script content cannot become posts", () => {
    const result = normalizeEmail(
      {
        ...mention,
        html: '<script>https://x.com/alice/status/123456</script><div hidden><a href="https://x.com/alice/status/123456">Hidden</a></div><a href="https://x.com.evil.example/alice/status/123456">Bad</a><a href="https://user:pass@x.com/alice/status/123456">Bad</a>',
      },
      true,
    );
    expect(result.reports).toHaveLength(0);
  });
  test("large digests are held for review without silently dropping posts", () => {
    const result = normalizeEmail(
      {
        ...mention,
        html: null,
        text: Array.from(
          { length: 21 },
          (_, i) => `https://x.com/alice/status/${1000 + i}`,
        ).join("\n"),
      },
      true,
    );
    expect(result.reports).toHaveLength(0);
    expect(result.ignored).toContain("exceeds 20");
  });
});
