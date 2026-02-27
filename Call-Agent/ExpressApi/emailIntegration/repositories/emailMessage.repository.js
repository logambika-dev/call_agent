import prisma from "../../prisma/client.js";
import { retryWithBackoff, batchEmailMessageUpsert } from "../../utils/prismaRetry.js";

class EmailMessageRepository {
  async bulkUpsert(messages) {
    // Use the optimized batch upsert function with built-in retry logic
    return await batchEmailMessageUpsert(prisma, messages);
  }

  async findByAccountId(emailAccountId, page = 1, limit = 20, sentiment = null, campaignId = null) {
    const skip = (page - 1) * limit;

    const where = {
      emailAccountId: BigInt(emailAccountId),
      // FILTER: Only show campaign-related emails (exclude general inbox emails)
      campaignId: { not: null },
      // FILTER: Only valid messages with sender name
      senderName: { not: null },
    };

    if (sentiment) {
      if (sentiment === "positive") where.replyType = { in: ["interested", "positive"] };
      else if (sentiment === "negative") where.replyType = { in: ["not_interested", "negative"] };
      else where.replyType = sentiment;
    }

    if (campaignId) {
      where.campaignId = String(campaignId);
    }

    const [data, total] = await Promise.all([
      prisma.emailMessage.findMany({
        where,
        orderBy: [
          { receivedAt: "desc" },
          { id: "desc" } // Secondary sort for consistent ordering
        ],
        skip,
        take: limit,
        select: {
          id: true,
          subject: true,
          senderName: true,
          senderEmail: true,
          receiver: true,
          receivedAt: true,
          isRead: true,
          bodyPreview: true,
          body: true, // ADDED
          messageId: true,
          campaignId: true,
          conversationId: true,
          type: true,
          replyType: true,
          emailAccountId: true,
          emailAccount: {
            select: {
              emailAccountId: true,
              email_address: true,
            },
          },
        },
      }),
      prisma.emailMessage.count({
        where,
      }),
    ]);

    // Extract unique receiver emails
    const receiverEmails = [...new Set(data.filter((msg) => msg.receiver).map((msg) => msg.receiver))];

    // Fetch contacts for these emails
    const contacts = await prisma.contact.findMany({
      where: { email: { in: receiverEmails } },
      select: { email: true, firstName: true, lastName: true, companyName: true },
    });

    const contactMap = contacts.reduce((acc, contact) => {
      acc[contact.email] = {
        name: `${contact.firstName || ""} ${contact.lastName || ""}`.trim() || contact.email,
        company: contact.companyName,
      };
      return acc;
    }, {});

    return {
      data: data.map((msg) => {
        const contactInfo = msg.receiver ? contactMap[msg.receiver] : null;
        return {
          ...msg,
          id: msg.id.toString(),
          emailAccountId: msg.emailAccountId.toString(),
          accountEmailId: msg.emailAccount.emailAccountId,
          accountEmail: msg.emailAccount.email_address,
          type: msg.type || "received",
          receiverName: contactInfo ? contactInfo.name : null,
          receiverCompany: contactInfo ? contactInfo.company : null,
        };
      }),
      pagination: {
        page,
        limit,
        total: Number(total),
        totalPages: Math.ceil(Number(total) / limit),
      },
    };
  }

  async findAllByUserId(user_id, page = 1, limit = 20, sentiment = null, campaignId = null) {
    if (!user_id) {
      throw new Error("user_id is required for fetching messages");
    }
    const skip = (page - 1) * limit;

    const where = {
      userId: user_id,
      // FILTER: Only show campaign-related emails (exclude general inbox emails)
      campaignId: { not: null },
      senderName: { not: null },
    };

    if (sentiment) {
      if (sentiment === "positive") where.replyType = { in: ["interested", "positive"] };
      else if (sentiment === "negative") where.replyType = { in: ["not_interested", "negative"] };
      else where.replyType = sentiment;
    }

    if (campaignId) {
      where.campaignId = String(campaignId);
    }

    console.log(where, "########where")

    const [data, total] = await Promise.all([
      prisma.emailMessage.findMany({
        where,
        orderBy: [
          { receivedAt: "desc" },
          { id: "desc" } // Secondary sort for consistent ordering
        ],
        skip,
        take: limit,
        select: {
          id: true,
          subject: true,
          senderName: true,
          senderEmail: true,
          receiver: true,
          receivedAt: true,
          isRead: true,
          bodyPreview: true,
          body: true, // ADDED
          messageId: true,
          campaignId: true, // ADDED: Required for grouping logic
          conversationId: true,
          type: true,
          replyType: true,
          emailAccountId: true,
          emailAccount: {
            select: {
              emailAccountId: true,
              email_address: true,
            },
          },
        },
      }),
      prisma.emailMessage.count({
        where,
      }),
    ]);

    // Extract unique receiver emails
    const receiverEmails = [...new Set(data.filter((msg) => msg.receiver).map((msg) => msg.receiver))];

    // Fetch contacts for these emails
    const contacts = await prisma.contact.findMany({
      where: { email: { in: receiverEmails } },
      select: { email: true, firstName: true, lastName: true, companyName: true },
    });

    const contactMap = contacts.reduce((acc, contact) => {
      acc[contact.email] = {
        name: `${contact.firstName || ""} ${contact.lastName || ""}`.trim() || contact.email,
        company: contact.companyName,
      };
      return acc;
    }, {});

    return {
      data: data.map((msg) => {
        const contactInfo = msg.receiver ? contactMap[msg.receiver] : null;
        return {
          ...msg,
          id: msg.id.toString(),
          emailAccountId: msg.emailAccountId.toString(),
          accountEmailId: msg.emailAccount.emailAccountId,
          accountEmail: msg.emailAccount.email_address,
          type: msg.type || "received",
          receiverName: contactInfo ? contactInfo.name : null,
          receiverCompany: contactInfo ? contactInfo.company : null,
        };
      }),
      pagination: {
        page,
        limit,
        total: Number(total),
        totalPages: Math.ceil(Number(total) / limit),
      },
    };
  }

  async getLastSyncDate(emailAccountId) {
    const lastMessage = await prisma.emailMessage.findFirst({
      where: { emailAccountId: BigInt(emailAccountId) },
      orderBy: { receivedAt: "desc" },
      select: { receivedAt: true },
    });
    return lastMessage?.receivedAt;
  }
}

export default new EmailMessageRepository();
