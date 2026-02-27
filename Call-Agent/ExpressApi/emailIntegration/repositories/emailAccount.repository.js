import prisma from "../../prisma/client.js";

class EmailAccountRepository {
  async create(data) {
    const account = await prisma.emailAccount.create({ data });
    return { ...account, id: account.id.toString() };
  }

  async findByUserIdAndEmail(user_id, email_address, provider) {
    return await prisma.emailAccount.findUnique({
      where: { uc_user_email: { user_id, provider, email_address } }
    });
  }

  async findByEmailAccountId(emailAccountId) {
    return await prisma.emailAccount.findUnique({
      where: { emailAccountId }
    });
  }

  async findByUserId(user_id) {
    const accounts = await prisma.emailAccount.findMany({
      where: { user_id, status: 'connected' },
      select: {
        id: true,
        email_address: true,
        provider: true,
        last_sync_at: true,
        status: true,
      }
    });
    return accounts.map(acc => ({
      ...acc,
      id: acc.id.toString()
    }));
  }

  async findById(id) {
    const account = await prisma.emailAccount.findUnique({ where: { id: BigInt(id) } });
    return account ? { ...account, id: account.id.toString() } : null;
  }

  async update(id, data) {
    const account = await prisma.emailAccount.update({ where: { id: BigInt(id) }, data });
    return { ...account, id: account.id.toString() };
  }

  async deactivate(id) {
    const account = await prisma.emailAccount.update({
      where: { id: BigInt(id) },
      data: { status: 'disconnected' }
    });
    return { ...account, id: account.id.toString() };
  }

  async findMany(options = {}) {
    return await prisma.emailAccount.findMany(options);
  }
}

export default new EmailAccountRepository();
