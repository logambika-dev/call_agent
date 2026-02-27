import axios from "axios";
import microsoftService from "./microsoft.service.js";
import gmailService from "./gmail.service.js";
// import emailAccountRepository from "../../emailIntegration/repositories/emailAccount.repository.js";
import emailAccountRepository from "../emailIntegration/repositories/emailAccount.repository.js"
import emailMessageRepository from "../emailIntegration/repositories/emailMessage.repository.js";
import emailQueueRepository from "../emailIntegration/repositories/emailQueue.repository.js";
import emailLogRepository from "../emailIntegration/repositories/emailLog.repository.js";
import { addEmailJobsBatch } from "../integrations/bullmq.config.js";
import prisma from "../prisma/client.js";
// import config from "../../config/index.js";
// import aiServiceClient from "../aiService.js";
// import { parseEmailBody } from "../../utils/emailParser.js";
import {parseEmailBody} from "../utils/emailParser.js"
// import callAgentService from "./callAgent.service.js";
import { getIO } from "../socket/index.js";
import { retryWithBackoff } from "../utils/prismaRetry.js";

class EmailIntegrationService {
  // Helper to extract email
  _extractEmail(text) {
    if (!text) return null;
    const match = text.match(/<(.+?)>/);
    return match ? match[1].toLowerCase().trim() : text.toLowerCase().trim();
  }

  // Helper to get all connected email addresses for a user to prevent loops
  async _getOwnEmails(userId) {
    if (!userId) return new Set();
    const accounts = await prisma.emailAccount.findMany({
      where: { user_id: userId },
      select: { email_address: true }
    });
    return new Set(accounts.map(a => a.email_address?.toLowerCase().trim()).filter(Boolean));
  }

  async authorizeProvider(provider, redirectUri, clientType = "personal") {
    if (provider === "microsoft") {
      const authUrl = microsoftService.getAuthUrl(redirectUri, clientType);
      console.log("###Authorize Provider Microsoft URL :", authUrl);
      return { authUrl };
    } else if (provider === "gmail") {
      const authUrl = gmailService.getAuthUrl(redirectUri);
      console.log("###Authorize Provider Gmail URL :", authUrl);
      return { authUrl };
    }
    throw new Error("Unsupported provider");
  }

  async handleCallback(provider, code, redirectUri, user_id, clientType = "personal") {
    console.log("### Handle Callback:", { provider, code, redirectUri, user_id, clientType });
    if (provider !== "microsoft" && provider !== "gmail") {
      throw new Error("Unsupported provider");
    }

    let tokens;
    let email_address;

    if (provider === "microsoft") {
      tokens = await microsoftService.getTokens(code, redirectUri, clientType);
      email_address = await microsoftService.getUserProfile(tokens.accessToken);
    } else if (provider === "gmail") {
      tokens = await gmailService.getTokens(code, redirectUri);
      email_address = await gmailService.getUserProfile(tokens.accessToken, tokens.refreshToken);
    }

    console.log("### Tokens received:", { hasAccessToken: !!tokens.accessToken });
    console.log("### Email address:", email_address);

    const existingAccount = await emailAccountRepository.findByUserIdAndEmail(user_id, email_address, provider);

    const tokenExpiry = new Date(Date.now() + tokens.expiresIn * 1000);

    // Generate unique emailAccountId if new account
    const emailAccountId = existingAccount?.emailAccountId || `EA_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    let account;
    console.log("### Handle Callback - Existing Account :", existingAccount);
    if (existingAccount) {
      account = await emailAccountRepository.update(existingAccount.id, {
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        token_expiry: tokenExpiry,
        client_type: clientType,
        status: "connected",
      });
    } else {
      account = await emailAccountRepository.create({
        emailAccountId,
        user_id,
        email_address,
        provider,
        client_type: clientType,
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        token_expiry: tokenExpiry,
        status: "connected",
      });
    }
    console.log("### Handle Callback - Account :", account);
    // Trigger sync without blocking (Full Sync on login)
    const syncAccountId = typeof account.id === "string" ? account.id : account.id.toString();
    console.log("### Triggering sync for account:", syncAccountId);
    this.syncInbox(syncAccountId, true).catch((err) => console.error("Initial sync failed:", err.message, err.stack));

    return { email: email_address };
  }

  async syncInbox(accountId, fullSync = false) {
    try {
      // console.log("### Sync Inbox Start - AccountId:", accountId);
      const account = await emailAccountRepository.findById(accountId);
      // console.log("### Account:", account);

      if (!account || account.status !== "connected") {
        console.log("### Account not found or not connected");
        return;
      }

      let accessToken = account.access_token;
      let refreshToken = account.refresh_token;

      // Refresh logic
      if (account.token_expiry && new Date() >= new Date(account.token_expiry)) {
        // console.log("### Token expired, refreshing...");
        let tokens;

        try {
          if (account.provider === "microsoft") {
            tokens = await microsoftService.refreshAccessToken(account.refresh_token, account.client_type);
          } else if (account.provider === "gmail") {
            tokens = await gmailService.refreshAccessToken(account.refresh_token);
          }

          accessToken = tokens.accessToken;
          // Gmail might not return a new refresh token, keep old one if so
          refreshToken = tokens.refreshToken || refreshToken;

          await emailAccountRepository.update(accountId, {
            access_token: accessToken,
            refresh_token: refreshToken,
            token_expiry: new Date(Date.now() + tokens.expiresIn * 1000),
            status: "connected", // Ensure it's marked as connected if refresh succeeds
          });
        } catch (refreshError) {
          const errorData = refreshError.response?.data || {};
          const isInvalidGrant = errorData.error === "invalid_grant" ||
            refreshError.message?.includes("invalid_grant") ||
            JSON.stringify(errorData).includes("expired or revoked");

          if (isInvalidGrant) {
            // console.error(`### Refresh Token Expired/Revoked for account ${accountId}. Marking as disconnected.`);
            await emailAccountRepository.update(accountId, {
              status: "disconnected",
            });
            return; // Stop sync as we have no valid token
          }
          throw refreshError; // Re-throw other errors
        }
      }

      const lastSyncDate = await emailMessageRepository.getLastSyncDate(accountId);
      // console.log("### Last Sync Date:", lastSyncDate);

      // Cache own emails for loop protection
      const ownEmails = await this._getOwnEmails(account.user_id);

      let messages = [];
      let newHistoryId = null;

      if (account.provider === "microsoft") {
        messages = await microsoftService.getMessages(accessToken, lastSyncDate);
      } else if (account.provider === "gmail") {
        const result = await gmailService.getMessages(accessToken, refreshToken, lastSyncDate, account.historyId, fullSync);
        if (result.messages) {
          messages = result.messages;
          newHistoryId = result.historyId;
        } else {
          messages = result; // Fallback if structure is different
        }
      }

      // console.log("### Messages Retrieved:", messages.length);

      if (messages.length > 0) {
        const messagesToInsert = [];

        for (const msg of messages) {
          // SELF-SENDER CORRECTION: If the message is from ANY of our accounts, it must be 'sent'
          // This fixes issues where internal emails between own accounts trigger replies
          const senderEmailClean = this._extractEmail(msg.senderEmail);
          const receiverEmailClean = this._extractEmail(msg.receiver);

          if (ownEmails.has(senderEmailClean)) {
            // console.log(`### Correction: Marking message ${msg.messageId} as SENT (sender is an own account)`);
            msg.type = "sent";
          }

          // Also check if it's sent TO ourselves (even if sender isn't us, e.g. CC/Forward)
          // We don't necessarily mark as sent if sender isn't us, but we should be careful.
          if (ownEmails.has(receiverEmailClean) && msg.type === "sent") {
            // If it's a sent message to ourselves, it's definitely an internal log
            // We keep it as sent to avoid triggering isReply
          }

          let isMerged = false;

          // For sent messages, try to find a matching temporary record to update
          if (msg.type === "sent") {
            const tempMatch = await prisma.emailMessage.findFirst({
              where: {
                emailAccountId: BigInt(accountId),
                subject: msg.subject,
                receiver: msg.receiver,
                OR: [{ messageId: { startsWith: "REQ_" } }, { messageId: { startsWith: "campaign_" } }],
              },
            });

            if (tempMatch) {
              // Check if a message with this real messageId already exists to avoid unique constraint violation
              const existingRealMsg = await prisma.emailMessage.findUnique({
                where: {
                  emailAccountId_messageId: {
                    emailAccountId: BigInt(accountId),
                    messageId: msg.messageId,
                  },
                },
              });

              if (existingRealMsg) {
                // console.log(
                //   `### Real message ${msg.messageId} already exists. Updating it with campaign info and deleting temp ${tempMatch.messageId}`
                // );
                // Move campaign info to the real message and remove the temporary one
                await prisma.emailMessage.update({
                  where: { id: existingRealMsg.id },
                  data: {
                    campaignId: tempMatch.campaignId,
                    contactId: tempMatch.contactId,
                    isReply: tempMatch.isReply || existingRealMsg.isReply,
                    replyType: tempMatch.replyType || existingRealMsg.replyType,
                    conversationId: msg.conversationId,
                    body: msg.body, // ADDED
                  },
                });
                await prisma.emailMessage.delete({ where: { id: tempMatch.id } });
              } else {
                // Update the temporary record with real IDs
                // console.log(`### Merging temp message ${tempMatch.messageId} with synced message ${msg.messageId}`);
                await prisma.emailMessage.update({
                  where: { id: tempMatch.id },
                  data: {
                    messageId: msg.messageId,
                    conversationId: msg.conversationId,
                    receivedAt: msg.receivedAt,
                    bodyPreview: msg.bodyPreview,
                    body: msg.body, // ADDED
                  },
                });
              }
              isMerged = true;
            }
          }

          if (!isMerged) {
            let linkedCampaignId = null;
            let linkedContactId = null;

            if (msg.conversationId) {
              const existingThreadMsg = await prisma.emailMessage.findFirst({
                where: {
                  conversationId: msg.conversationId,
                  campaignId: { not: null },
                },
                select: { campaignId: true, contactId: true },
              });
              if (existingThreadMsg) {
                linkedCampaignId = existingThreadMsg.campaignId;
                linkedContactId = existingThreadMsg.contactId;
                // console.log(`### Linked message ${msg.messageId} to campaign ${linkedCampaignId} via conversation ${msg.conversationId}`);
              }
            }

            // If not found via conversation, try finding contact by email
            if (!linkedContactId && msg.senderEmail) {
              const cleanSenderEmail = this._extractEmail(msg.senderEmail);
              // console.log(`### Attempting to link incoming email from ${cleanSenderEmail} (original: "${msg.senderEmail}") to a campaign...`);
              const contact = await prisma.contact.findFirst({
                where: { email: cleanSenderEmail, userId: account.user_id },
                select: { id: true },
              });
              if (contact) {
                linkedContactId = contact.id;
                // console.log(`✓ Found contact: ${contact.id} for email: ${msg.senderEmail}`);
                const campaignContact = await prisma.campaignContact.findFirst({
                  where: {
                    contactId: contact.id,
                    campaign: {
                      status: { in: ["ACTIVE", "PROCESSING", "PAUSED", "COMPLETED"] }
                    }
                    // Allow tracking replies even for paused/completed campaigns
                  },
                  orderBy: { id: "desc" },
                  select: { campaignId: true },
                });

                if (campaignContact) {
                  linkedCampaignId = String(campaignContact.campaignId);
                  console.log(`✓ Linked message ${msg.messageId} to campaign ${linkedCampaignId} via contact ${contact.id}`);
                } else {
                  console.log(`✗ Contact ${contact.id} found, but NO ACTIVE CAMPAIGN found.`);
                }
              } else {
                // console.log(`✗ SENDER EMAIL "${msg.senderEmail}" NOT FOUND IN CONTACTS - Email will not appear as a reply!`);
              }
            }

            // If not found via conversation or contact, fallback to account-level campaignId
            if (!linkedCampaignId && account.campaignId) {
              linkedCampaignId = String(account.campaignId);
              console.log(`### Linked message ${msg.messageId} to account-level campaign ${linkedCampaignId}`);
            }

            messagesToInsert.push({
              ...msg,
              campaignId: linkedCampaignId,
              contactId: linkedContactId,
              emailAccountId: accountId,
              userId: account.user_id,
              isReply: !!linkedCampaignId && msg.type === "received",
            });

            if (msg.type === "received") {
              console.log(`[FINAL] Message from ${msg.senderEmail}: campaignId=${linkedCampaignId}, contactId=${linkedContactId}, isReply=${!!linkedCampaignId && msg.type === "received"}`);
            }
          }
        }

        if (messagesToInsert.length > 0) {
          // console.log("### Inserting messages:", messagesToInsert.length);
          await emailMessageRepository.bulkUpsert(messagesToInsert);
          // console.log("### Messages inserted successfully");


        } else {
          console.log("### All messages matched and merged, no new insertions.");
        }
      }

      // Emit Socket Event if messages were inserted
      if (messages.length > 0) {
        try {
          const io = getIO();
          io.to(account.user_id).emit("email:new", {
            accountId: accountId,
            count: messages.length,
            messages: messages.slice(0, 5) // Send a few previews
          });
          console.log(`### Emitted 'email:new' event to user ${account.user_id}`);
        } catch (socketErr) {
          console.error("Failed to emit socket event:", socketErr.message);
        }
      }

      await emailAccountRepository.update(accountId, {
        last_sync_at: new Date(),
        historyId: newHistoryId || account.historyId // Update historyId if new one exists
      });
      console.log("### Sync completed for account:", accountId);
    } catch (error) {
      console.error("### Sync Error for account", accountId, ":", error.message);
      console.error("### Error details:", error.response?.data || error.stack);
      throw error;
    }
  }

  async getConnectedAccounts(user_id) {
    return await emailAccountRepository.findByUserId(user_id);
  }

  async disconnectAccount(accountId, user_id) {
    const account = await emailAccountRepository.findById(accountId);

    if (!account || account.user_id !== user_id) {
      throw new Error("Account not found");
    }

    // Deactivate account (keep messages)
    await emailAccountRepository.deactivate(accountId);
  }

  async getMessages(user_id, _emailAccountId = null, page = 1, limit = 20, sentiment = null, campaignId = null) {
    try {
      let result;
      if (_emailAccountId && _emailAccountId !== "all") {
        const account = await emailAccountRepository.findById(_emailAccountId);
        console.log("### User ID:", user_id);
        if (!account || account.user_id !== user_id) {
          throw new Error("Access denied or account not found.");
        }
        result = await emailMessageRepository.findByAccountId(_emailAccountId, page, limit, sentiment, campaignId);
      } else {
        result = await emailMessageRepository.findAllByUserId(user_id, page, limit, sentiment, campaignId);
      }
      // console.log("### Result:", result);
      console.log("### Messages fetched:", result.data.length);
      const threads = {};

      if (result.data && Array.isArray(result.data)) {
        // Track seen messageIds for deduplication
        const seenMessageIds = new Set();

        // Collect all unique contacts involved to batch fetch their campaign history
        const allContacts = new Set();
        result.data.forEach((msg) => {
          const e1 = this._extractEmail(msg.senderEmail);
          const e2 = this._extractEmail(msg.receiver);
          // We assume the one that is NOT the user is the contact.
          // But getting exact user email is tricky without passing it or assuming.
          // For now, let's just collect both, filtering later.
          if (e1) allContacts.add(e1);
          if (e2) allContacts.add(e2);
        });

        // Fetch campaign usage for these contacts (Optimization or do per thread?)
        // Doing per thread might be easier but slower. Let's do a simple DB query?
        // Since we are in service, we can use prisma.
        // Let's use Prisma to find which campaigns these emails are in.

        const contactCampaignMap = {}; // email -> [Set of campaignIds]

        if (allContacts.size > 0) {
          const contactsList = Array.from(allContacts);
          const campaignContacts = await prisma.campaignContact.findMany({
            where: {
              contact: { email: { in: contactsList } },
            },
            select: {
              campaignId: true,
              contact: { select: { email: true } },
            },
          });

          campaignContacts.forEach((cc) => {
            const email = cc.contact.email.toLowerCase();
            if (!contactCampaignMap[email]) {
              contactCampaignMap[email] = new Set();
            }
            contactCampaignMap[email].add(cc.campaignId);
          });
        }

        result.data.forEach((msg) => {
          // FILTER: Skip messages without a sender name (Requested by user to fix duplicates)
          if (!msg.senderName) return;

          // DEDUPLICATION: Ensure unique messageId
          if (seenMessageIds.has(msg.messageId)) return;
          seenMessageIds.add(msg.messageId);

          // 2. Identify Campaign ID (Normalization)
          let activeCampaignId = msg.campaignId;

          // Fallback: If not set, check if messageId contains campaign info (e.g., campaign_28_...)
          if ((!activeCampaignId || activeCampaignId === "general") && msg.messageId?.startsWith("campaign_")) {
            const parts = msg.messageId.split("_");
            if (parts[1]) activeCampaignId = parts[1];
          }
          activeCampaignId = activeCampaignId || "general";

          // 3. Create a Shared Participant Key
          const email1 = this._extractEmail(msg.senderEmail);
          const email2 = this._extractEmail(msg.receiver);
          // Key Requirement: Group by Campaign ID + Participants
          const participantKey = [email1, email2].sort().join("_");

          const threadKey = `${msg.userId}_${activeCampaignId}_${participantKey}`;

          if (!threads[threadKey]) {
            // Identify which email is the "external contact" to check previous campaigns
            // We assume the one who IS NOT the current account email is the contact.
            // We don't have account email handy easily in this scope without looking up accountId again?
            // Actually getMessages is called with _emailAccountId optionally, or checking msg.emailAccountId
            // Simplification: Check both against our map.

            const otherCampaigns = new Set();
            [email1, email2].forEach((e) => {
              if (contactCampaignMap[e]) {
                contactCampaignMap[e].forEach((cId) => {
                  if (String(cId) !== String(activeCampaignId)) {
                    otherCampaigns.add(cId);
                  }
                });
              }
            });

            threads[threadKey] = {
              conversationId: threadKey, // Unique ID for the frontend chat list
              campaignId: activeCampaignId,
              participants: participantKey,
              subject: msg.subject,
              lastMessageAt: msg.receivedAt,
              messageId: msg.messageId,
              messageCount: 0,
              messages: [],
              previousCampaigns: Array.from(otherCampaigns), // For "Used in previous campaign" label
            };
          }

          // Upgrade campaignId if we find a more specific one in the thread
          if (threads[threadKey].campaignId === "general" && activeCampaignId !== "general") {
            threads[threadKey].campaignId = activeCampaignId;
          }

          // 5. Add UI logic for "Sides" and Clean Body
          const formattedMsg = {
            ...msg,
            displaySide: ["sent", "launch", "sequence", "followup"].includes(msg.type) ? "right" : "left",
            cleanBody: parseEmailBody(msg.body || msg.bodyPreview || ""),
          };

          threads[threadKey].messages.push(formattedMsg);
          threads[threadKey].messageCount++;

          // Update thread metadata if this message is the most recent
          if (new Date(msg.receivedAt) > new Date(threads[threadKey].lastMessageAt)) {
            threads[threadKey].lastMessageAt = msg.receivedAt;
            threads[threadKey].messageId = msg.messageId;
            threads[threadKey].subject = msg.subject;
          }
        });
      }

      // 6. Finalize: Sort internal messages and the final thread list
      const aggregatedArray = Object.values(threads).map((thread) => {
        // Propagate campaignId to all messages in the thread if missing
        if (thread.campaignId && thread.campaignId !== "general") {
          thread.messages.forEach((m) => {
            if (!m.campaignId || m.campaignId === "general") {
              m.campaignId = thread.campaignId;
              if (m.campaign === "general" || !m.campaign) {
                m.campaign = thread.campaignId;
              }
            }
          });
        }

        // Sort messages OLD TO NEW (Standard Chat Flow)
        thread.messages.sort((a, b) => new Date(a.receivedAt) - new Date(b.receivedAt));
        return thread;
      });

      // Sort the Chat List NEWEST ACTIVITY first
      aggregatedArray.sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));

      return {
        ...result,
        data: aggregatedArray,
      };
    } catch (error) {
      console.error("### Grouping Error:", error.message);
      throw error;
    }
  }
  async getCampaignStats(user_id, campaignId) {
    try {
      const activeCampaignId = String(campaignId);

      // 1. Total Sent: From EmailQueue (status='sent')
      // Only count sent emails that were part of this campaign
      const totalSent = await prisma.emailQueue.count({
        where: {
          campaignId: parseInt(activeCampaignId), // EmailQueue stores Int
          status: "sent",
        },
      });

      // 2. Open Rate: From EmailQueue (openedAt is not null)
      const totalOpened = await prisma.emailQueue.count({
        where: {
          campaignId: parseInt(activeCampaignId),
          status: "sent",
          openedAt: { not: null },
        },
      });

      // 3. Click Rate: From EmailQueue (clickCount > 0)
      const totalClicked = await prisma.emailQueue.count({
        where: {
          campaignId: parseInt(activeCampaignId),
          status: "sent",
          clickCount: { gt: 0 },
        },
      });

      // 4. Reply Rate: Messages received in this campaign (Still from EmailMessage)
      const totalReplied = await prisma.emailMessage.count({
        where: {
          userId: user_id,
          campaignId: activeCampaignId,
          type: "received",
        },
      });

      const openRate = totalSent > 0 ? ((totalOpened / totalSent) * 100).toFixed(2) : 0;
      const clickRate = totalSent > 0 ? ((totalClicked / totalSent) * 100).toFixed(2) : 0;
      const replyRate = totalSent > 0 ? ((totalReplied / totalSent) * 100).toFixed(2) : 0;

      // 5. Bounce Count: Contacts marked as 'BOUNCED' or 'Bounced' in this campaign
      const totalBounced = await prisma.campaignContact.count({
        where: {
          campaignId: parseInt(activeCampaignId),
          campaignStatus: { in: ["BOUNCED", "Bounced"] },
        },
      });

      // Deliverability: (Delivered / Sent) * 100
      // Delivered = Sent - Bounced
      const totalDelivered = Math.max(0, totalSent - totalBounced);
      const deliverability = totalSent > 0 ? ((totalDelivered / totalSent) * 100).toFixed(2) : 0;

      return {
        totalSent,
        totalDelivered,
        totalOpened,
        totalClicked,
        totalReplied,
        openRate: parseFloat(openRate),
        clickRate: parseFloat(clickRate),
        replyRate: parseFloat(replyRate),
        deliverability: parseFloat(deliverability),
      };
    } catch (error) {
      console.error("Error calculating campaign stats:", error);
      throw error;
    }
  }
  async syncAllAccounts(user_id) {
    const accounts = await emailAccountRepository.findByUserId(user_id);

    // Trigger syncs in background to avoid Gateway Timeout (504)
    accounts.forEach((account) => {
      const accountId = typeof account.id === "string" ? account.id : account.id.toString();
      this.syncInbox(accountId).catch((err) => {
        console.error(`Background sync failed for account ${accountId}:`, err.message);
      });
    });

    return {
      synced: accounts.length,
      message: "Sync started in background"
    };
  }

  async sendEmail(user_id, emailAccountId, emailData) {
    const account = await emailAccountRepository.findById(emailAccountId);

    if (!account || account.user_id !== user_id) {
      throw new Error("Account not found");
    }

    let accessToken = account.access_token;
    let refreshToken = account.refresh_token;

    // Refresh token if expired
    if (account.token_expiry && new Date() >= new Date(account.token_expiry)) {
      try {
        let tokens;
        if (account.provider === "microsoft") {
          tokens = await microsoftService.refreshAccessToken(account.refresh_token, account.client_type);
        } else if (account.provider === "gmail") {
          tokens = await gmailService.refreshAccessToken(account.refresh_token);
        }

        accessToken = tokens.accessToken;
        refreshToken = tokens.refreshToken || refreshToken;

        await emailAccountRepository.update(emailAccountId, {
          access_token: accessToken,
          refresh_token: refreshToken,
          token_expiry: new Date(Date.now() + tokens.expiresIn * 1000),
          status: "connected",
        });
      } catch (refreshError) {
        const errorData = refreshError.response?.data || {};
        const isInvalidGrant = errorData.error === "invalid_grant" ||
          refreshError.message?.includes("invalid_grant") ||
          JSON.stringify(errorData).includes("expired or revoked");

        if (isInvalidGrant) {
          console.error(`### Refresh Token Expired/Revoked for account ${emailAccountId}. Marking as disconnected.`);
          await emailAccountRepository.update(emailAccountId, {
            status: "disconnected",
          });
          throw new Error("Email account authentication failed. Account marked as disconnected.");
        }
        throw refreshError;
      }
    }

    if (account.provider === "microsoft") {
      return await microsoftService.sendEmail(accessToken, emailData);
    } else if (account.provider === "gmail") {
      return await gmailService.sendEmail(accessToken, refreshToken, emailData);
    }
  }

  async replyToEmail(user_id, emailAccountId, messageId, replyData) {
    let account = null;
    try {
      account = await emailAccountRepository.findById(emailAccountId);
      console.log("### Account found:", account);
    } catch (e) {
      console.log("### Error fetching account:", e);
    }

    if (!account) {
      account = await emailAccountRepository.findByEmailAccountId(emailAccountId);
      console.log("### Account found2:", account);
    }

    if (!account || account.user_id !== user_id) {
      throw new Error("Account not found");
    }

    let accessToken = account.access_token;
    let refreshToken = account.refresh_token;

    // Refresh token if expired
    // Refresh token if expired
    if (account.token_expiry && new Date() >= new Date(account.token_expiry)) {
      try {
        let tokens;
        if (account.provider === "microsoft") {
          tokens = await microsoftService.refreshAccessToken(account.refresh_token, account.client_type);
        } else if (account.provider === "gmail") {
          tokens = await gmailService.refreshAccessToken(account.refresh_token);
        }

        accessToken = tokens.accessToken;
        refreshToken = tokens.refreshToken || refreshToken;

        await emailAccountRepository.update(emailAccountId, {
          access_token: accessToken,
          refresh_token: refreshToken,
          token_expiry: new Date(Date.now() + tokens.expiresIn * 1000),
          status: "connected",
        });
      } catch (refreshError) {
        const errorData = refreshError.response?.data || {};
        const isInvalidGrant = errorData.error === "invalid_grant" ||
          refreshError.message?.includes("invalid_grant") ||
          JSON.stringify(errorData).includes("expired or revoked");

        if (isInvalidGrant) {
          console.error(`### Refresh Token Expired/Revoked for account ${emailAccountId}. Marking as disconnected.`);
          await emailAccountRepository.update(emailAccountId, {
            status: "disconnected",
          });
          throw new Error("Email account authentication failed. Account marked as disconnected.");
        }
        throw refreshError;
      }
    }

    try {
      let originalMessage = await prisma.emailMessage.findFirst({
        where: {
          messageId: messageId,
          emailAccount: { user_id: user_id },
        },
      });

      if (!originalMessage && messageId.startsWith("campaign_")) {
        try {
          const parts = messageId.split("_");
          if (parts.length >= 4) {
            const cId = parts[1];
            const cntId = parseInt(parts[3]);
            if (cId && !isNaN(cntId)) {
              originalMessage = await prisma.emailMessage.findFirst({
                where: {
                  campaignId: cId,
                  contactId: cntId,
                  emailAccount: { user_id: user_id },
                },
              });
              if (originalMessage) {
                console.log(`### Smart Match: Found original message via metadata. Swapping ${messageId} -> ${originalMessage.messageId}`);
                messageId = originalMessage.messageId;
              }
            }
          }
        } catch (parseErr) {
          console.log("### Smart Match parse failed:", parseErr.message);
        }
      }

      let result;

      // Check if messageId is an internal ID (e.g., campaign generated or request ID)
      let useFallback = messageId.includes("campaign_") || messageId.startsWith("REQ_") || !originalMessage;

      if (!useFallback) {
        try {
          console.log(`### Attempting provider reply for MessageID: ${messageId} (Provider: ${account.provider})`);
          if (account.provider === "microsoft") {
            // Use standard Graph API reply
            result = await microsoftService.replyToEmail(accessToken, messageId, {
              ...replyData,
              to: replyData.to,
            });
          } else if (account.provider === "gmail") {
            result = await gmailService.replyToEmail(accessToken, refreshToken, messageId, {
              ...replyData,
              to: replyData.to, // Gmail service expects 'to' array
            });
          }
          console.log("### Provider reply success:", JSON.stringify(result));
        } catch (error) {
          console.error(`### Provider reply failed: ${error.message}`);
          // If message not found (404) or bad request (400) which might signify invalid ID, switch to fallback
          if (error.response && (error.response.status === 404 || error.response.status === 400)) {
            console.log(`### API failed with ${error.response.status}, switching to fallback for messageId: ${messageId}`);
            useFallback = true;
          } else {
            throw error;
          }
        }
      }

      if (useFallback) {
        // Fallback to sending a new email but formatted as a reply
        console.log(`### Using fallback sendEmail for internal/missing/failed messageId: ${messageId}`);
        const subject = originalMessage?.subject
          ? originalMessage.subject.startsWith("Re:")
            ? originalMessage.subject
            : `Re: ${originalMessage.subject}`
          : "Reply";

        // Ensure we have at least one recipient
        const recipients =
          replyData.to && replyData.to.length > 0 ? replyData.to : originalMessage?.senderEmail ? [originalMessage.senderEmail] : [];

        if (recipients.length === 0) {
          throw new Error("No recipients defined for fallback reply");
        }

        const sendResult = await microsoftService.sendEmail(accessToken, {
          to: recipients,
          subject: subject,
          body: replyData.body,
        });
        console.log("### Send result:", sendResult);
        result = {
          success: sendResult.success,
          messageId: sendResult.messageId,
          conversationId: originalMessage?.conversationId, // Keep existing conversation ID if available
        };
      }

      // Store the sent reply in the database
      if (result.success) {
        const conversationId = result.conversationId || originalMessage?.conversationId;

        // If original message has no conversationId (e.g. launch email), update it
        if (originalMessage && !originalMessage.conversationId && conversationId) {
          await prisma.emailMessage.update({
            where: { id: originalMessage.id },
            data: { conversationId: conversationId },
          });
        }

        // Fetch user to get name
        const user = await prisma.user.findUnique({
          where: { id: user_id },
        });

        const senderName = user?.firstName || account.email_address;

        const sentMessage = {
          emailAccountId: account.id,
          messageId: result.messageId || `REQ_${Date.now()}`,
          conversationId: conversationId,
          subject: originalMessage?.subject
            ? originalMessage.subject.startsWith("Re:")
              ? originalMessage.subject
              : `Re: ${originalMessage.subject}`
            : "Reply",
          senderEmail: account.email_address, // The connected account sent it
          senderName: senderName, // User's name
          receiver: replyData.to ? replyData.to[0] : null, // The primary recipient
          bodyPreview: replyData.body ? replyData.body : "",
          isRead: true,
          type: "sent",
          receivedAt: new Date(),
          updatedAt: new Date(),
          isReply: true,
          userId: user_id,
          campaignId: replyData.campaignId || originalMessage?.campaignId || null,
        };

        // Use upsert to avoid duplicates if sync runs concurrently
        await retryWithBackoff(
          () =>
            prisma.emailMessage.upsert({
              where: {
                emailAccountId_messageId: {
                  emailAccountId: BigInt(account.id),
                  messageId: sentMessage.messageId,
                },
              },
              update: sentMessage,
              create: sentMessage,
            }),
          {
            maxRetries: 3,
            initialDelay: 100,
            maxDelay: 5000,
            operationName: `Upsert reply message ${sentMessage.messageId}`
          }
        );
      }

      return result;
    } catch (error) {
      if (error.response?.data?.error?.code === "ErrorAccessDenied") {
        throw new Error("Insufficient permissions. Please reconnect your account to enable reply functionality.");
      }
      throw error;
    }
  }

  async addEmailsToCampaignQueue(campaignId, emailsData) {
    try {
      console.log(`### Adding ${emailsData.length} emails to campaign queue`);

      const queueData = emailsData.map((email) => ({
        campaignId,
        contactId: email.contactId || null,
        emailAccountId: BigInt(0), // Will be assigned during distribution
        recipientEmail: email.to,
        subject: email.subject,
        body: email.body,
        cc: email.cc || null,
        bcc: email.bcc || null,
        status: "pending",
      }));

      const created = await emailQueueRepository.bulkCreate(queueData);
      console.log(`### ${created.count} emails added to campaign queue`);
      return created;
    } catch (error) {
      console.error("### Error adding emails to campaign queue:", error.message);
      throw error;
    }
  }

  async distributeCampaignEmails(campaignId, userId) {
    try {
      console.log(`### Distributing emails for campaign ${campaignId}`);

      // Get pending emails for this campaign
      const pendingQueues = await emailQueueRepository.findPendingByCampaign(campaignId);

      if (pendingQueues.length === 0) {
        console.log(`### No pending emails for campaign ${campaignId}`);
        return { success: true, distributed: 0 };
      }

      // Get user's connected accounts
      const accounts = await emailAccountRepository.findByUserId(userId);
      const connectedAccounts = accounts.filter((acc) => acc.status === "connected");

      if (connectedAccounts.length === 0) {
        throw new Error("No connected email accounts found");
      }

      console.log(`### Found ${connectedAccounts.length} connected accounts`);
      console.log(`### Distributing ${pendingQueues.length} emails in round-robin fashion`);

      const jobsToAdd = [];

      // Round-robin distribution
      pendingQueues.forEach((queue, index) => {
        const accountIndex = index % connectedAccounts.length;
        const assignedAccount = connectedAccounts[accountIndex];

        console.log(`### Email ${index + 1}/${pendingQueues.length}: ${queue.recipientEmail} → ${assignedAccount.email_address}`);

        const jobData = {
          emailAccountId: assignedAccount.id,
          recipientEmail: queue.recipientEmail,
          subject: queue.subject,
          body: queue.body,
          cc: queue.cc || "",
          bcc: queue.bcc || "",
          jobId: `JOB_${campaignId}_${queue.id}_${Date.now()}`,
          emailQueueId: queue.id.toString(),
        };

        jobsToAdd.push(jobData);
      });

      // Add all jobs to BullMQ queue
      const addedJobs = await addEmailJobsBatch(jobsToAdd);
      console.log(`### Added ${addedJobs.length} jobs to BullMQ queue`);

      // Update queue status to 'queued'
      for (const queue of pendingQueues) {
        await emailQueueRepository.update(queue.id, {
          status: "queued",
        });
      }

      return {
        success: true,
        distributed: addedJobs.length,
        accounts: connectedAccounts.length,
      };
    } catch (error) {
      console.error("### Error distributing campaign emails:", error.message);
      throw error;
    }
  }

  /**
   * Get campaign sending statistics
   */
  async getCampaignStatistics(campaignId) {
    try {
      const stats = await emailQueueRepository.getStatistics(campaignId);

      return {
        pending: stats.find((s) => s.status === "pending")?._count?.id || 0,
        queued: stats.find((s) => s.status === "queued")?._count?.id || 0,
        sent: stats.find((s) => s.status === "sent")?._count?.id || 0,
        failed: stats.find((s) => s.status === "failed")?._count?.id || 0,
      };
    } catch (error) {
      console.error("### Error getting campaign statistics:", error.message);
      throw error;
    }
  }

  /**
   * Get sending logs for a campaign
   */
  async getCampaignLogs(campaignId, status = null, limit = 100) {
    try {
      const queueRecords = await emailQueueRepository.findByCampaignId(campaignId, limit);

      if (status) {
        return queueRecords.filter((q) => q.status === status);
      }
      return queueRecords;
    } catch (error) {
      console.error("### Error getting campaign logs:", error.message);
      throw error;
    }
  }

  async retryCampaignFailedEmails(campaignId) {
    try {
      console.log(`### Retrying failed emails for campaign ${campaignId}`);

      const failedQueues = await emailQueueRepository.findByCampaignId(campaignId);
      const toRetry = failedQueues.filter((q) => q.status === "failed" && q.attemptCount < q.maxRetries);

      for (const queue of toRetry) {
        await emailQueueRepository.update(queue.id, {
          status: "pending",
          attemptCount: queue.attemptCount + 1,
        });
      }

      console.log(`### Marked ${toRetry.length} emails for retry`);
      return { retried: toRetry.length };
    } catch (error) {
      console.error("### Error retrying failed emails:", error.message);
      throw error;
    }
  }

  async getEmailLogs(emailQueueId) {
    try {
      const logs = await emailLogRepository.findByEmailQueueId(emailQueueId);
      return logs;
    } catch (error) {
      console.error("### Error getting email logs:", error.message);
      throw error;
    }
  }

  async getAccountSendingStats(emailAccountId, startDate, endDate) {
    try {
      const logs = await emailLogRepository.findByAccountId(emailAccountId, 1000);

      const filtered = logs.filter((log) => new Date(log.createdAt) >= new Date(startDate) && new Date(log.createdAt) <= new Date(endDate));

      return {
        total: filtered.length,
        sent: filtered.filter((l) => l.status === "sent").length,
        failed: filtered.filter((l) => l.status === "failed").length,
        pending: filtered.filter((l) => l.status === "pending").length,
      };
    } catch (error) {
      console.error("### Error getting account sending stats:", error.message);
      throw error;
    }
  }
  _extractEmail(str) {
    if (!str) return "";
    const match = str.match(/<([^>]+)>/);
    return match ? match[1].toLowerCase().trim() : str.toLowerCase().trim();
  }
}

export default new EmailIntegrationService();
