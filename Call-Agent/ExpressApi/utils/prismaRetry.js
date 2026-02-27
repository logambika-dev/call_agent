import logger from "../utils/logger.js";

/**
 * Retry wrapper for database operations with exponential backoff
 * Handles transient errors like lock timeouts
 * 
 * @param {Function} operation - Async function to retry
 * @param {Object} options - Configuration options
 * @param {number} options.maxRetries - Maximum retry attempts (default: 3)
 * @param {number} options.initialDelay - Initial delay in ms (default: 100)
 * @param {number} options.maxDelay - Maximum delay in ms (default: 5000)
 * @param {string} options.operationName - Name for logging (default: "Operation")
 * @returns {Promise} Result of the operation
 */
export async function retryWithBackoff(operation, options = {}) {
  const {
    maxRetries = 3,
    initialDelay = 100,
    maxDelay = 5000,
    operationName = "Database Operation"
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      logger.debug(`### Executing ${operationName} (attempt ${attempt + 1}/${maxRetries + 1})`);
      return await operation();
    } catch (error) {
      lastError = error;

      // Check if it's a transient error worth retrying
      const isTransientError =
        error.message?.includes("Lock wait timeout") ||
        error.message?.includes("ECONNREFUSED") ||
        error.message?.includes("ETIMEDOUT") ||
        error.message?.includes("EHOSTUNREACH") ||
        error.code === "ECONNABORTED";

      if (!isTransientError || attempt === maxRetries) {
        // Not retryable or out of retries
        logger.error(`### ${operationName} failed permanently: ${error.message}`);
        throw error;
      }

      // Calculate backoff delay with jitter
      const delay = Math.min(
        initialDelay * Math.pow(2, attempt) + Math.random() * 1000,
        maxDelay
      );

      logger.warn(`### ${operationName} failed (attempt ${attempt + 1}): ${error.message}`);
      logger.warn(`### Retrying in ${Math.round(delay)}ms... (${maxRetries - attempt} retries left)`);

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Batch upsert for emailMessage records to prevent lock timeouts
 * Instead of individual upserts, combine them to reduce transaction count
 */
export async function batchEmailMessageUpsert(prisma, messages) {
  if (!messages || messages.length === 0) {
    return [];
  }

  logger.info(`### Starting batch upsert of ${messages.length} email messages`);

  const results = [];
  const chunkSize = 2; // Process 2 at a time to reduce connection pool contention
  // Since each upsert is taking a connection and possibly holding it, smaller chunks are safer

  for (let i = 0; i < messages.length; i += chunkSize) {
    const chunk = messages.slice(i, i + chunkSize);
    logger.debug(`### Processing chunk ${Math.floor(i / chunkSize) + 1}/${Math.ceil(messages.length / chunkSize)}`);

    const chunkResults = await Promise.allSettled(
      chunk.map(async (msg) => {
        // Add a small random jitter delay before each op to desynchronize requests
        await new Promise(resolve => setTimeout(resolve, Math.random() * 50));
        return retryWithBackoff(
          () =>
            prisma.emailMessage.upsert({
              where: {
                emailAccountId_messageId: {
                  emailAccountId: BigInt(msg.emailAccountId),
                  messageId: msg.messageId,
                },
              },
              create: msg, // Use the full msg object for create
              update: msg, // Use the full msg object for update
            }),
          {
            maxRetries: 5, // Increase retries
            initialDelay: 100,
            maxDelay: 5000,
            operationName: `Upsert email message ${msg.messageId}`
          }
        );
      })
    );

    // Handle results
    for (let j = 0; j < chunkResults.length; j++) {
      if (chunkResults[j].status === "fulfilled") {
        results.push(chunkResults[j].value);
        logger.debug(`### ✓ Upserted message ${chunk[j].messageId}`);
      } else {
        logger.error(`### ✗ Failed to upsert message ${chunk[j].messageId}: ${chunkResults[j].reason}`);
        results.push(null);
      }
    }

    // Larger delay between chunks to let pool recover
    if (i + chunkSize < messages.length) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  logger.info(`### Batch upsert completed: ${results.filter(r => r !== null).length}/${messages.length} successful`);
  return results.filter(r => r !== null);
}

/**
 * Create a transaction-safe wrapper for Prisma operations
 */
export async function transactionWithRetry(prisma, callback, options = {}) {
  const { maxRetries = 3, operationName = "Transaction" } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      logger.debug(`### Starting ${operationName} (attempt ${attempt + 1}/${maxRetries + 1})`);
      return await prisma.$transaction(callback, {
        maxWait: 5000,  // Max time to wait for transaction
        timeout: 10000  // Max transaction duration
      });
    } catch (error) {
      if (
        (error.message?.includes("Lock wait timeout") ||
          error.message?.includes("Deadlock detected")) &&
        attempt < maxRetries
      ) {
        const delay = Math.min(100 * Math.pow(2, attempt), 2000);
        logger.warn(`### ${operationName} deadlock detected. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        logger.error(`### ${operationName} failed: ${error.message}`);
        throw error;
      }
    }
  }
}

export default {
  retryWithBackoff,
  batchEmailMessageUpsert,
  transactionWithRetry
};
