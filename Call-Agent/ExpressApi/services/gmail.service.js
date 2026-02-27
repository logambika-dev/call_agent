import { google } from "googleapis";
// import logger from "../../utils/logger.js";
import logger from "../utils/logger.js"

class GmailService {
  constructor() {
    this.clientId = process.env.GOOGLE_CLIENT_ID;
    this.clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    this.redirectUri = process.env.GOOGLE_REDIRECT_URI || "http://localhost:5173/settings";
  }

  getOAuthClient(redirectUri) {
    return new google.auth.OAuth2(this.clientId, this.clientSecret, redirectUri || this.redirectUri);
  }

  getAuthUrl(redirectUri) {
    const oauth2Client = this.getOAuthClient(redirectUri);

    const scopes = [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
    ];

    return oauth2Client.generateAuthUrl({
      access_type: "offline", // Request offline access (refresh token)
      scope: scopes,
      prompt: "consent", // Force to receive refresh token
      state: "gmail",
    });
  }

  async getTokens(code, redirectUri) {
    const oauth2Client = this.getOAuthClient(redirectUri);
    const { tokens } = await oauth2Client.getToken(code);
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expiry_date ? (tokens.expiry_date - Date.now()) / 1000 : 3600,
    };
  }

  async getUserProfile(accessToken, refreshToken) {
    const oauth2Client = this.getOAuthClient();
    oauth2Client.setCredentials({ access_token: accessToken, refresh_token: refreshToken });

    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const { data } = await oauth2.userinfo.get();
    return data.email;
  }

  async refreshAccessToken(refreshToken) {
    const oauth2Client = this.getOAuthClient();
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    const { credentials } = await oauth2Client.refreshAccessToken();
    return {
      accessToken: credentials.access_token,
      refreshToken: credentials.refresh_token || refreshToken, // Use old one if not returned
      expiresIn: credentials.expiry_date ? (credentials.expiry_date - Date.now()) / 1000 : 3600,
    };
  }

  async getMessages(accessToken, refreshToken, lastSyncDate = null, historyId = null, fullSync = false) {
    const oauth2Client = this.getOAuthClient();
    oauth2Client.setCredentials({ access_token: accessToken, refresh_token: refreshToken });
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    // Helper to fetch details
    const fetchMessageDetails = async (messageId) => {
      try {
        const { data } = await gmail.users.messages.get({
          userId: "me",
          id: messageId,
          format: "full",
        });
        return data;
      } catch (e) {
        logger.warn(`Failed to fetch message details for ${messageId}: ${e.message}`);
        return null;
      }
    };

    // Helper to extract headers
    const getHeader = (headers, name) => headers.find((h) => h.name === name)?.value || "";

    let messagesToFetch = [];
    let newHistoryId = historyId; // Will be updated

    try {
      // 1. Try History Sync if historyId is present and not a full sync
      if (historyId && !fullSync) {
        try {
          console.log(`### Attempting Gmail History Sync with ID: ${historyId}`);
          let pageToken = null;
          do {
            const res = await gmail.users.history.list({
              userId: "me",
              startHistoryId: historyId,
              pageToken: pageToken,
              maxResults: 500,
            });

            if (res.data.history) {
              for (const record of res.data.history) {
                if (record.messagesAdded) {
                  messagesToFetch.push(...record.messagesAdded.map(m => m.message));
                }
                // We can also handle 'messagesDeleted' or 'labelsAdded' if needed
              }
            }
            newHistoryId = res.data.historyId || newHistoryId;
            pageToken = res.data.nextPageToken;
          } while (pageToken);

          console.log(`### History Sync found ${messagesToFetch.length} new messages.`);
        } catch (historyError) {
          console.warn("### History Sync failed (likely expired), falling back to full sync:", historyError.message);
          // Fallback to standard sync
          historyId = null;
        }
      }

      // 2. Standard Sync (Time-based or Deep Sync)
      if (!historyId || fullSync) {
        console.log(`### Performing Standard Sync (Full: ${fullSync})`);
        let query = "";

        if (!fullSync && lastSyncDate) {
          // Add 5 minutes (300 seconds) safety buffer
          const safeTimeCheck = new Date(lastSyncDate).getTime() - 5 * 60 * 1000;
          const seconds = Math.floor(safeTimeCheck / 1000);
          query = `after:${seconds}`;
        } else {
          // Full Sync / Deep Sync: Fetch last 30 days if no lastSyncDate or explicit fullSync
          // Or just fetch everything? "prev messages also when the user login"
          // Let's do a reasonably deep sync (e.g. 1 month) or just rely on pagination limit.
          // If fullSync is true, we might want more.
          // For "load prev messages", we usually want the most recent ones first.
        }

        const getAllMessages = async (label) => {
          let allMessages = [];
          let pageToken = null;
          let pageCount = 0;
          // If fullSync/DeepSync, increase pages
          const MAX_PAGES = fullSync ? 50 : 10;

          do {
            const res = await gmail.users.messages.list({
              userId: "me",
              q: `${query} label:${label}`,
              maxResults: 50, // Max allowed is 500, but let's be safe. standard is 100.
              pageToken: pageToken
            });

            if (res.data.messages) {
              allMessages = allMessages.concat(res.data.messages);
            }
            pageToken = res.data.nextPageToken;
            pageCount++;
          } while (pageToken && pageCount < MAX_PAGES);

          return allMessages;
        };

        // Fetch Inbox and Sent
        const [inboxIds, sentIds, profileRes] = await Promise.all([
          getAllMessages("INBOX"),
          getAllMessages("SENT"),
          gmail.users.getProfile({ userId: "me" }) // Get current historyId
        ]);

        messagesToFetch = [...inboxIds, ...sentIds];
        newHistoryId = profileRes.data.historyId;
      }

      // Deduplicate by ID
      const uniqueIds = Array.from(new Set(messagesToFetch.map(m => m.id)))
        .map(id => messagesToFetch.find(a => a.id === id));

      console.log(`### Fetching details for ${uniqueIds.length} unique messages...`);

      const details = await Promise.all(uniqueIds.map((m) => fetchMessageDetails(m.id)));
      const validDetails = details.filter(d => d !== null);

      const parsedMessages = validDetails.map((msg) => {
        const headers = msg.payload.headers;
        const subject = getHeader(headers, "Subject");
        const from = getHeader(headers, "From");
        const to = getHeader(headers, "To");
        const msgIdHeader = getHeader(headers, "Message-ID");

        // Parse "Name <email@example.com>"
        const parseAddress = (addr) => {
          if (!addr) return { name: "", email: "" };
          const match = addr.match(/(.*)<(.*)>/);
          if (match) return { name: match[1].trim().replace(/^"|"$/g, ""), email: match[2].trim() };
          return { name: "", email: addr.trim() };
        };

        const sender = parseAddress(from);
        const receiver = parseAddress(to); // Simplified: takes first To

        const isSent = msg.labelIds.includes("SENT");

        // Body extraction helper (handles nested parts)
        const getBody = (payload) => {
          if (payload.body?.data) {
            return Buffer.from(payload.body.data, "base64").toString("utf-8");
          }
          if (payload.parts) {
            // First try to find HTML part
            const htmlPart = payload.parts.find((p) => p.mimeType === "text/html");
            if (htmlPart && htmlPart.body?.data) {
              return Buffer.from(htmlPart.body.data, "base64").toString("utf-8");
            }
            // If no HTML, try to find text part
            const textPart = payload.parts.find((p) => p.mimeType === "text/plain");
            if (textPart && textPart.body?.data) {
              return Buffer.from(textPart.body.data, "base64").toString("utf-8");
            }
            // If still nothing, recurse into other parts
            for (const part of payload.parts) {
              const result = getBody(part);
              if (result) return result;
            }
          }
          return "";
        };

        const body = getBody(msg.payload);

        return {
          messageId: msg.id, // Gmail ID
          // conversationId in Gmail is threadId
          conversationId: msg.threadId,
          subject: subject,
          senderName: sender.name,
          senderEmail: sender.email,
          receiver: receiver.email,
          receivedAt: new Date(parseInt(msg.internalDate)),
          isRead: !msg.labelIds.includes("UNREAD"),
          bodyPreview: msg.snippet,
          body: body, // ADDED
          type: isSent ? "sent" : "received",
        };
      });

      return {
        messages: parsedMessages,
        historyId: newHistoryId
      };

    } catch (error) {
      logger.error("Error fetching Gmail messages:", error);
      throw error;
    }
  }

  async sendEmail(accessToken, refreshToken, { to, subject, body, cc = [], bcc = [] }) {
    const oauth2Client = this.getOAuthClient();
    oauth2Client.setCredentials({ access_token: accessToken, refresh_token: refreshToken });
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    // Function to encode string to Base64URL
    const encodeBase64Key = (str) => {
      const buffer = Buffer.from(str, "utf-8");
      return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    };

    const makeBody = (to, from, subject, message, cc, bcc) => {
      const str = [
        `From: ${from}`,
        `Reply-To: ${from}`,
        `To: ${to.join(", ")}`,
        ...(cc && cc.length ? [`Cc: ${cc.join(", ")}`] : []),
        ...(bcc && bcc.length ? [`Bcc: ${bcc.join(", ")}`] : []),
        `Subject: ${subject}`,
        `Content-Type: text/html; charset=utf-8`,
        `MIME-Version: 1.0`,
        "",
        message,
      ].join("\r\n"); // Use CRLF

      return encodeBase64Key(str);
    };

    // Fetch user profile to get the 'from' email address
    // This is better than 'me' for the header display
    const userProfile = await this.getUserProfile(accessToken, refreshToken);

    const encodedMessage = makeBody(to, userProfile, subject, body, cc, bcc);

    try {
      const res = await gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw: encodedMessage,
        },
      });

      console.log("### Gmail Send Response:", res.status, res.data);
      return { success: true, messageId: res.data.id, conversationId: res.data.threadId };
    } catch (error) {
      console.error("### Gmail Send Error details:", error.response ? error.response.data : error.message);
      throw error;
    }
  }

  async replyToEmail(accessToken, refreshToken, messageId, { body, replyAll, to }) {
    // Gmail Reply involves:
    // 1. Get original message to find Thread ID and Subject (Re: ...) and References/In-Reply-To
    // 2. Send new message with correct Thread ID and Headers

    const oauth2Client = this.getOAuthClient();
    oauth2Client.setCredentials({ access_token: accessToken, refresh_token: refreshToken });
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    // Get original
    console.log(`### Gmail replyToEmail - fetching original for id: ${messageId}`);
    const original = await gmail.users.messages.get({ userId: "me", id: messageId });
    const headers = original.data.payload.headers;

    const getHeader = (name) => headers.find((h) => h.name === name)?.value || "";
    const subject = getHeader("Subject");
    const references = getHeader("References");
    const msgId = getHeader("Message-ID");

    const newSubject = subject.startsWith("Re:") ? subject : `Re: ${subject}`;
    const newReferences = references ? `${references} ${msgId}` : msgId;

    const makeBody = () => {
      const str = [
        `To: ${to.join(", ")}`,
        `Subject: ${newSubject}`,
        `In-Reply-To: ${msgId}`,
        `References: ${newReferences}`,
        `Content-Type: text/html; charset=utf-8`,
        `MIME-Version: 1.0`,
        "",
        body,
      ].join("\n");

      return Buffer.from(str).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    };

    const encodedMessage = makeBody();

    const res = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encodedMessage,
        threadId: original.data.threadId,
      },
    });

    return {
      success: true,
      messageId: res.data.id,
      conversationId: res.data.threadId,
    };
  }
}

export default new GmailService();
