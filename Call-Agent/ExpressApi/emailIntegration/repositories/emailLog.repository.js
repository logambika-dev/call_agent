import prisma from "../../prisma/client.js";

class EmailLogRepository {
  async create(logData) {
    try {
      const log = await prisma.emailLog.create({
        data: logData,
        include: { emailAccount: true }
      });
      return log;
    } catch (error) {
      console.error('### Error creating email log:', error.message);
      throw error;
    }
  }

  async findById(id) {
    try {
      const log = await prisma.emailLog.findUnique({
        where: { id: BigInt(id) },
        include: { emailAccount: true }
      });
      return log;
    } catch (error) {
      console.error('### Error finding email log by id:', error.message);
      throw error;
    }
  }

  async findByEmailQueueId(emailQueueId) {
    try {
      const logs = await prisma.emailLog.findMany({
        where: { emailQueueId: BigInt(emailQueueId) },
        include: { emailAccount: true },
        orderBy: { createdAt: 'desc' }
      });
      return logs;
    } catch (error) {
      console.error('### Error finding logs by emailQueueId:', error.message);
      throw error;
    }
  }

  async findByAccountId(emailAccountId, limit = 100) {
    try {
      const logs = await prisma.emailLog.findMany({
        where: { emailAccountId: BigInt(emailAccountId) },
        include: { emailAccount: true },
        take: limit,
        orderBy: { createdAt: 'desc' }
      });
      return logs;
    } catch (error) {
      console.error('### Error finding logs by accountId:', error.message);
      throw error;
    }
  }

  async findByStatus(status, limit = 100) {
    try {
      const logs = await prisma.emailLog.findMany({
        where: { status },
        include: { emailAccount: true },
        take: limit,
        orderBy: { createdAt: 'desc' }
      });
      return logs;
    } catch (error) {
      console.error('### Error finding logs by status:', error.message);
      throw error;
    }
  }

  async getSuccessfulSends(emailAccountId, fromDate) {
    try {
      const logs = await prisma.emailLog.findMany({
        where: {
          emailAccountId: BigInt(emailAccountId),
          status: 'sent',
          sentAt: {
            gte: fromDate
          }
        },
        orderBy: { sentAt: 'desc' }
      });
      return logs;
    } catch (error) {
      console.error('### Error getting successful sends:', error.message);
      throw error;
    }
  }

  async getFailedSends(emailAccountId, fromDate) {
    try {
      const logs = await prisma.emailLog.findMany({
        where: {
          emailAccountId: BigInt(emailAccountId),
          status: 'failed',
          createdAt: {
            gte: fromDate
          }
        },
        orderBy: { createdAt: 'desc' }
      });
      return logs;
    } catch (error) {
      console.error('### Error getting failed sends:', error.message);
      throw error;
    }
  }

  async getSendStatistics(emailAccountId, fromDate) {
    try {
      const stats = await prisma.emailLog.groupBy({
        by: ['status'],
        where: {
          emailAccountId: BigInt(emailAccountId),
          createdAt: {
            gte: fromDate
          }
        },
        _count: {
          id: true
        }
      });
      return stats;
    } catch (error) {
      console.error('### Error getting send statistics:', error.message);
      throw error;
    }
  }

  async getCampaignSendStatistics(emailAccountId, campaignPeriod) {
    try {
      const logs = await prisma.emailLog.findMany({
        where: {
          emailAccountId: BigInt(emailAccountId),
          createdAt: {
            gte: campaignPeriod.startDate,
            lte: campaignPeriod.endDate
          }
        },
        include: { emailAccount: true }
      });

      const stats = {
        total: logs.length,
        sent: logs.filter(l => l.status === 'sent').length,
        failed: logs.filter(l => l.status === 'failed').length,
        pending: logs.filter(l => l.status === 'pending').length,
        logs
      };
      return stats;
    } catch (error) {
      console.error('### Error getting campaign send statistics:', error.message);
      throw error;
    }
  }

  async createBatch(logsData) {
    try {
      const created = await prisma.emailLog.createMany({
        data: logsData,
        skipDuplicates: true
      });
      return created;
    } catch (error) {
      console.error('### Error creating batch email logs:', error.message);
      throw error;
    }
  }

  async update(id, updateData) {
    try {
      const updated = await prisma.emailLog.update({
        where: { id: BigInt(id) },
        data: updateData,
        include: { emailAccount: true }
      });
      return updated;
    } catch (error) {
      console.error('### Error updating email log:', error.message);
      throw error;
    }
  }
}

export default new EmailLogRepository();
