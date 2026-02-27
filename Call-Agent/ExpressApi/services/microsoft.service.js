import axios from "axios";

class MicrosoftService {
  constructor() {
    this.clients = {
      personal: {
        clientId: process.env.MICROSOFT_CLIENT_ID,
        clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
        tenantId: process.env.MICROSOFT_TENANT_ID || "common",
      },
      organization: {
        clientId: process.env.MICROSOFT_ORG_CLIENT_ID,
        clientSecret: process.env.MICROSOFT_ORG_CLIENT_SECRET,
        tenantId: process.env.MICROSOFT_ORG_TENANT_ID || "common",
      },
    };
    this.scopes =
      "openid profile email https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read offline_access";
  }

  getClientConfig(clientType = "personal") {
    return this.clients[clientType] || this.clients.personal;
  }

  getAuthUrl(redirectUri, clientType = "personal") {
    const config = this.getClientConfig(clientType);
    const params = new URLSearchParams({
      client_id: config.clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      response_mode: "query",
      scope: this.scopes,
    });

    return `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/authorize?${params.toString()}`;
  }

  async getTokens(code, redirectUri, clientType = "personal") {
    try {
      const config = this.getClientConfig(clientType);

      const params = new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      });

      const response = await axios.post(
        `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`,
        params,
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expires_in,
      };
    } catch (error) {
      console.error(
        "### Microsoft Token Error:",
        error.response?.data || error.message
      );
      throw error;
    }
  }

  async refreshAccessToken(refreshToken, clientType = "personal") {
    const config = this.getClientConfig(clientType);

    const params = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    });

    const response = await axios.post(
      "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      params,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    return {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expiresIn: response.data.expires_in,
    };
  }

  buildAuthHeaders(accessToken) {
    return {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };
  }

  async getUserProfile(accessToken) {
    try {
      const response = await axios.get(
        "https://graph.microsoft.com/v1.0/me",
        {
          headers: this.buildAuthHeaders(accessToken),
        }
      );

      const email =
        response.data.mail || response.data.userPrincipalName;

      if (!email) {
        throw new Error("No email found in user profile");
      }

      return email;
    } catch (error) {
      console.error(
        "### Get User Profile Error:",
        error.response?.data || error.message
      );
      throw error;
    }
  }

  async getMessages(accessToken) {
    const headers = this.buildAuthHeaders(accessToken);

    const fields = "id,conversationId,subject,from,toRecipients,receivedDateTime,sentDateTime,isRead,bodyPreview,body";
    const [inboxResponse, sentResponse] = await Promise.all([
      axios.get(
        `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=50&$orderby=receivedDateTime desc&$select=${fields}`,
        { headers }
      ),
      axios.get(
        `https://graph.microsoft.com/v1.0/me/mailFolders/sentitems/messages?$top=50&$orderby=sentDateTime desc&$select=${fields}`,
        { headers }
      ),
    ]);

    const inboxMessages = inboxResponse.data.value.map((msg) => ({
      messageId: msg.id,
      conversationId: msg.conversationId || `CONV_${msg.id}`,
      subject: msg.subject,
      senderName: msg.from?.emailAddress?.name,
      senderEmail: msg.from?.emailAddress?.address,
      receiver: msg.toRecipients?.[0]?.emailAddress?.address,
      receivedAt: new Date(msg.receivedDateTime),
      isRead: msg.isRead,
      bodyPreview: msg.bodyPreview,
      body: msg.body?.content, // ADDED
      type: "received",
    }));

    const sentMessages = sentResponse.data.value.map((msg) => ({
      messageId: msg.id,
      conversationId: msg.conversationId || `CONV_${msg.id}`,
      subject: msg.subject,
      senderName: msg.from?.emailAddress?.name,
      senderEmail: msg.from?.emailAddress?.address,
      receiver: msg.toRecipients?.[0]?.emailAddress?.address,
      receivedAt: new Date(msg.sentDateTime),
      isRead: true, // Sent messages are implicitly read
      bodyPreview: msg.bodyPreview,
      body: msg.body?.content, // ADDED
      type: "sent",
    }));

    console.log(`### Fetched ${inboxMessages.length} inbox messages (Unread only) and ${sentMessages.length} sent messages`);

    return [...inboxMessages, ...sentMessages].sort((a, b) => b.receivedAt - a.receivedAt);
  }

  async sendEmail(accessToken, { to, subject, body, cc = [], bcc = [] }) {
    console.log("### Sending Email to:", to);
    const message = {
      message: {
        subject,
        body: {
          contentType: "HTML",
          content: body,
        },
        toRecipients: to.map((email) => ({
          emailAddress: { address: email },
        })),
        ccRecipients: cc.map((email) => ({
          emailAddress: { address: email },
        })),
        bccRecipients: bcc.map((email) => ({
          emailAddress: { address: email },
        })),
      },
    };

    const response = await axios.post(
      "https://graph.microsoft.com/v1.0/me/sendMail",
      message,
      {
        headers: this.buildAuthHeaders(accessToken),
      }
    );

    return {
      success: true,
      messageId: response.headers["x-ms-request-id"],
    };
  }

  async replyToEmail(accessToken, messageId, { body, replyAll = false, to = [] }) {
    try {
      const headers = this.buildAuthHeaders(accessToken);

      const endpoint = replyAll
        ? `https://graph.microsoft.com/v1.0/me/messages/${messageId}/createReplyAll`
        : `https://graph.microsoft.com/v1.0/me/messages/${messageId}/createReply`;

      const response = await axios.post(endpoint, {}, { headers });

      const draftId = response.data.id;

      await axios.patch(
        `https://graph.microsoft.com/v1.0/me/messages/${draftId}`,
        {
          body: {
            contentType: "HTML",
            content: body,
          },
          // Microsoft auto-sets "To" to the original sender (us, in checking sent items).
          // We MUST overwrite this with the actual intended recipient.
          toRecipients: to.map((email) => ({
            emailAddress: { address: email },
          })),
        },
        { headers }
      );

      await axios.post(
        `https://graph.microsoft.com/v1.0/me/messages/${draftId}/send`,
        {},
        { headers }
      );

      return { success: true, messageId: draftId };
    } catch (error) {
      console.error(
        "Reply error:",
        error.response?.data || error.message
      );
      throw error;
    }
  }

  async revokeToken(accessToken, clientType = "personal") {
    try {
      const { tenantId } = this.getClientConfig(clientType);

      await axios.post(
        `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/logout`,
        {},
        {
          headers: this.buildAuthHeaders(accessToken),
        }
      );
    } catch (error) {
      // Token revocation is best effort
      console.error("Token revocation failed:", error.message);
    }
  }
}

export default new MicrosoftService();
