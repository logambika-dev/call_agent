import prisma from "../../prisma/client.js";

class EmailQueueRepository {
  async create(emailQueueData) {
    try {
      const queue = await prisma.emailQueue.create({
        data: emailQueueData,
      });
      return queue;
    } catch (error) {
      console.error("### Error creating email queue:", error.message);
      throw error;
    }
  }

  async bulkCreate(emailQueues) {
    try {
      const created = await prisma.emailQueue.createMany({
        data: emailQueues,
        skipDuplicates: true,
      });
      return created;
    } catch (error) {
      console.error("### Error bulk creating email queue:", error.message);
      throw error;
    }
  }

  async findById(id) {
    try {
      const queue = await prisma.emailQueue.findUnique({
        where: { id: BigInt(id) },
        include: {
          emailAccount: true,
        },
      });
      return queue;
    } catch (error) {
      console.error("### Error finding email queue by id:", error.message);
      throw error;
    }
  }

  async findByJobId(jobId) {
    try {
      const queue = await prisma.emailQueue.findUnique({
        where: { jobId },
        include: {
          emailAccount: true,
        },
      });
      return queue;
    } catch (error) {
      console.error("### Error finding email queue by jobId:", error.message);
      throw error;
    }
  }

  async findByStatus(status, limit = 100) {
    try {
      const queues = await prisma.emailQueue.findMany({
        where: { status },
        include: { emailAccount: true },
        take: limit,
        orderBy: { createdAt: "asc" },
      });
      return queues;
    } catch (error) {
      console.error("### Error finding email queue by status:", error.message);
      throw error;
    }
  }

  async findByCampaignId(campaignId, limit = 100) {
    try {
      const queues = await prisma.emailQueue.findMany({
        where: { campaignId },
        include: { emailAccount: true },
        take: limit,
        orderBy: { createdAt: "asc" },
      });
      return queues;
    } catch (error) {
      console.error("### Error finding email queue by campaignId:", error.message);
      throw error;
    }
  }

  async findPendingByCampaign(campaignId) {
    try {
      const queues = await prisma.emailQueue.findMany({
        where: {
          campaignId,
          status: "pending",
          OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
        },
        include: { emailAccount: true },
        orderBy: { createdAt: "asc" },
      });
      return queues;
    } catch (error) {
      console.error("### Error finding pending queues by campaign:", error.message);
      throw error;
    }
  }

  async update(id, updateData) {
    try {
      const updated = await prisma.emailQueue.update({
        where: { id: BigInt(id) },
        data: updateData,
        include: { emailAccount: true },
      });
      return updated;
    } catch (error) {
      console.error("### Error updating email queue:", error.message);
      throw error;
    }
  }

  async updateByJobId(jobId, updateData) {
    try {
      const updated = await prisma.emailQueue.update({
        where: { jobId },
        data: updateData,
        include: { emailAccount: true },
      });
      return updated;
    } catch (error) {
      console.error("### Error updating email queue by jobId:", error.message);
      throw error;
    }
  }

  async delete(id) {
    try {
      const deleted = await prisma.emailQueue.delete({
        where: { id: BigInt(id) },
      });
      return deleted;
    } catch (error) {
      console.error("### Error deleting email queue:", error.message);
      throw error;
    }
  }

  async getStatistics(campaignId) {
    try {
      const stats = await prisma.emailQueue.groupBy({
        by: ["status"],
        where: { campaignId },
        _count: {
          id: true,
        },
      });
      return stats;
    } catch (error) {
      console.error("### Error getting queue statistics:", error.message);
      throw error;
    }
  }

  async getRetryableQueues(limit = 100) {
    try {
      const queues = await prisma.emailQueue.findMany({
        where: {
          status: "failed",
          attemptCount: {
            lt: 3, // Less than max retries
          },
          nextRetryAt: {
            lte: new Date(),
          },
        },
        include: { emailAccount: true },
        take: limit,
        orderBy: { nextRetryAt: "asc" },
      });
      return queues;
    } catch (error) {
      console.error("### Error getting retryable queues:", error.message);
      throw error;
    }
  }

  async getQueuesByAccountAndCampaign(emailAccountId, campaignId) {
    try {
      const queues = await prisma.emailQueue.findMany({
        where: {
          emailAccountId: BigInt(emailAccountId),
          campaignId,
        },
        include: { emailAccount: true },
        orderBy: { createdAt: "asc" },
      });
      return queues;
    } catch (error) {
      console.error("### Error finding queues by account and campaign:", error.message);
      throw error;
    }
  }
}

export default new EmailQueueRepository();
