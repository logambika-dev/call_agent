export const parseEmailBody = (body) => {
  if (!body) return "";

  // 1. Initial cleanup of common HTML containers for replies
  let text = body;

  // Remove <div class="gmail_quote">...</div>
  // Note: This matches simple nested quotes but might fail on complex nested structures.
  // For a robust solution, we'd need a DOM parser, but regex is okay for 90% cases here.
  text = text.replace(/<div class="gmail_quote">[\s\S]*?<\/div>/gi, "");
  text = text.replace(/<blockquote[^>]*>[\s\S]*?<\/blockquote>/gi, "");

  // 2. Convert to Plain Text (Simulate Frontend Logic)
  // Replace line breaking tags with newlines
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/p>/gi, "\n\n");
  text = text.replace(/<\/div>/gi, "\n");

  // Strip all other tags
  let plainText = text.replace(/<[^>]*>?/gm, "");

  // Decode HTML entities
  plainText = plainText
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  // 3. Regex Pattern Matching for Reply Headers
  // We want to stop at the FIRST occurrence of a reply header.

  const quotePatterns = [
    // Standard "On [Date], [Someone] wrote:"
    // Matches: On Sun, 21 Dec, 2025 at 8:35 PM, <email> wrote:
    /On\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)?,?\s*\d{1,2}\s+\w{3}\s+\d{4}.*?wrote:/is,

    // Outlook style
    /From:\s+.*?\n?Sent:\s+.*?\n?To:\s+.*?\n?Subject:/is,
    /________________________________/,
  ];

  let cutoffIndex = plainText.length;

  for (const pattern of quotePatterns) {
    const match = plainText.match(pattern);
    if (match && match.index < cutoffIndex) {
      cutoffIndex = match.index;
    }
  }

  let cleanText = plainText.substring(0, cutoffIndex).trim();

  cleanText = cleanText.replace(/\n\s*\n/g, "\n\n");

  return cleanText;
};
