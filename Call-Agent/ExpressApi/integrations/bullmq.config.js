import { Queue, Worker } from "bullmq";

import redis from "./index.js";
import logger from "../utils/logger.js";

const QUEUE_NAME = "email-send-queue";

// Rate limiting config to prevent Microsoft Graph API throttling
const RATE_LIMITER_CONFIG = {
  max: 15, // max 15 messages
  duration: 90000 // per 1 minute (60 seconds)
};

const QUEUE_CONFIG = {
  connection: redis,
  defaultJobOptions: {
    attempts: 3, // Retry up to 3 times
    backoff: {
      type: "exponential",
      delay: 2000, // Start with 2 second delay
    },
    removeOnComplete: {
      age: 3600, // Keep completed jobs for 1 hour
    },
    removeOnFail: {
      age: 86400, // Keep failed jobs for 24 hours
    },
  },
};

// Initialize BullMQ Queue
let emailQueue = null;

export function getEmailQueue() {
  if (!emailQueue) {
    emailQueue = new Queue(QUEUE_NAME, QUEUE_CONFIG);

    // Listen to queue events
    emailQueue.on("error", (error) => {
      logger.error("### Queue Error:", error);
    });

    emailQueue.on("waiting", (job) => {
      logger.info(`### Job ${job.id} is waiting to be processed`);
    });

    emailQueue.on("active", (job) => {
      logger.info(`### Job ${job.id} is active`);
    });

    emailQueue.on("completed", (job) => {
      logger.info(`### Job ${job.id} completed successfully`);
    });

    emailQueue.on("failed", (job, err) => {
      logger.error(`### Job ${job.id} failed:`, err.message);
    });

    emailQueue.on("stalled", (jobId) => {
      logger.warn(`### Job ${jobId} has stalled`);
    });
  }
  return emailQueue;
}

/**
 * Add a single email job to the queue
 */
export async function addEmailJob(jobData) {
  try {
    const queue = getEmailQueue();
    const job = await queue.add("send-email", jobData, {
      jobId: jobData.jobId, // Unique job ID
      priority: jobData.priority || 5,
      delay: jobData.delay || 0,
    });
    logger.info(`### Email job added to queue:`, { jobId: job.id, queueId: jobData.jobId });
    return job;
  } catch (error) {
    logger.error("### Error adding email job to queue:", error.message);
    throw error;
  }
}

/**
 * Add multiple email jobs to the queue (batch)
 */
export async function addEmailJobsBatch(jobsData) {
  try {
    const queue = getEmailQueue();
    const jobs = await queue.addBulk(
      jobsData.map((jobData, index) => ({
        name: "send-email",
        data: jobData,
        opts: {
          jobId: jobData.jobId,
          priority: jobData.priority || jobsData.length - index, // Higher priority for earlier jobs
          delay: jobData.delay || 0,
        },
      }))
    );
    logger.info(`### ${jobs.length} email jobs added to queue`);
    return jobs;
  } catch (error) {
    logger.error("### Error adding bulk email jobs to queue:", error.message);
    throw error;
  }
}

/**
 * Get job details
 */
export async function getJob(jobId) {
  try {
    const queue = getEmailQueue();
    const job = await queue.getJob(jobId);
    return job;
  } catch (error) {
    logger.error("### Error getting job from queue:", error.message);
    throw error;
  }
}

/**
 * Get queue size and counts
 */
export async function getQueueStats() {
  try {
    const queue = getEmailQueue();
    const counts = await queue.getJobCounts("wait", "active", "completed", "failed", "delayed", "paused");
    return counts;
  } catch (error) {
    logger.error("### Error getting queue stats:", error.message);
    throw error;
  }
}

/**
 * Retry a failed job
 */
export async function retryJob(jobId) {
  try {
    const queue = getEmailQueue();
    const job = await queue.getJob(jobId);
    if (job) {
      await job.retry("failed");
      logger.info(`### Job ${jobId} retried`);
      return job;
    }
    return null;
  } catch (error) {
    logger.error("### Error retrying job:", error.message);
    throw error;
  }
}

/**
 * Remove a job from queue
 */
export async function removeJob(jobId) {
  try {
    const queue = getEmailQueue();
    const job = await queue.getJob(jobId);
    if (job) {
      await job.remove();
      logger.info(`### Job ${jobId} removed from queue`);
      return true;
    }
    return false;
  } catch (error) {
    logger.error("### Error removing job:", error.message);
    throw error;
  }
}

/**
 * Clear all jobs from queue
 */
export async function clearQueue() {
  try {
    const queue = getEmailQueue();
    await queue.clean(0, 100);
    logger.info("### Queue cleared");
  } catch (error) {
    logger.error("### Error clearing queue:", error.message);
    throw error;
  }
}

/**
 * Initialize Worker for processing email jobs
 * @param {Function} processor - The job processor function
 */
export async function initializeWorker(processor) {
  try {
    const worker = new Worker(QUEUE_NAME, processor, {
      connection: redis,
      concurrency: 1, // Process one job at a time per worker
      limiter: RATE_LIMITER_CONFIG, // Rate limiting
      settings: {
        maxStalledCount: 2,
        stalledInterval: 5000,
        lockDuration: 30000,
      },
    });

    // Worker event handlers
    worker.on("completed", (job, returnvalue) => {
      logger.info(`### Job ${job.id} completed with result:`, returnvalue);
    });

    worker.on("failed", (job, err) => {
      logger.error(`### Job ${job.id} failed:`, err.message);
    });

    worker.on("error", (error) => {
      logger.error("### Worker error:", error);
    });

    logger.info("### Email Worker initialized with rate limiting:", RATE_LIMITER_CONFIG);
    return worker;
  } catch (error) {
    logger.error("### Error initializing worker:", error.message);
    throw error;
  }
}

/**
 * Get failed jobs
 */
export async function getFailedJobs(start = 0, end = -1) {
  try {
    const queue = getEmailQueue();
    const jobs = await queue.getFailed(start, end);
    return jobs;
  } catch (error) {
    logger.error("### Error getting failed jobs:", error.message);
    throw error;
  }
}

/**
 * Get waiting jobs
 */
export async function getWaitingJobs(start = 0, end = -1) {
  try {
    const queue = getEmailQueue();
    const jobs = await queue.getWaiting(start, end);
    return jobs;
  } catch (error) {
    logger.error("### Error getting waiting jobs:", error.message);
    throw error;
  }
}

/**
 * Get active jobs
 */
export async function getActiveJobs(start = 0, end = -1) {
  try {
    const queue = getEmailQueue();
    const jobs = await queue.getActive(start, end);
    return jobs;
  } catch (error) {
    logger.error("### Error getting active jobs:", error.message);
    throw error;
  }
}

/**
 * Pause queue
 */
export async function pauseQueue() {
  try {
    const queue = getEmailQueue();
    await queue.pause();
    logger.info("### Queue paused");
  } catch (error) {
    logger.error("### Error pausing queue:", error.message);
    throw error;
  }
}

/**
 * Resume queue
 */
export async function resumeQueue() {
  try {
    const queue = getEmailQueue();
    await queue.resume();
    logger.info("### Queue resumed");
  } catch (error) {
    logger.error("### Error resuming queue:", error.message);
    throw error;
  }
}

export { QUEUE_NAME, RATE_LIMITER_CONFIG };

const CAMPAIGN_QUEUE_NAME = "campaign-generation-queue";

// Initialize Campaign Queue
let campaignQueue = null;

export function getCampaignQueue() {
  if (!campaignQueue) {
    campaignQueue = new Queue(CAMPAIGN_QUEUE_NAME, {
      connection: redis,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 5000,
        },
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 86400 },
      },
    });

    campaignQueue.on("error", (error) => logger.error("### Campaign Queue Error:", error));
    campaignQueue.on("failed", (job, err) => logger.error(`### Campaign Job ${job.id} failed:`, err.message));
  }
  return campaignQueue;
}

export async function addCampaignJob(jobData) {
  try {
    const queue = getCampaignQueue();
    let delay = 0;
    if (jobData.startDate) {
      const start = new Date(jobData.startDate).getTime();
      const now = Date.now();
      if (start > now) {
        delay = start - now;
      }
    }

    const job = await queue.add("generate-campaign", jobData, {
      jobId: `campaign_gen_${jobData.campaignId}_${Date.now()}`,
      delay: delay,
    });
    logger.info(`### Campaign generation job added to queue: ${job.id} with delay ${delay}ms`);
    return job;
  } catch (error) {
    logger.error("### Error adding campaign job to queue:", error.message);
    throw error;
  }
}

export async function initializeCampaignWorker(processor) {
  try {
    const worker = new Worker(CAMPAIGN_QUEUE_NAME, processor, {
      connection: redis,
      concurrency: 2,
      lockDuration: 120000,
    });

    worker.on("completed", (job) => logger.info(`### Campaign Job ${job.id} completed`));
    worker.on("failed", (job, err) => logger.error(`### Campaign Job ${job.id} failed:`, err.message));
    worker.on("error", (err) => logger.error("### Campaign Worker error:", err));

    logger.info("### Campaign Worker initialized");
    return worker;
  } catch (error) {
    logger.error("### Error initializing campaign worker:", error.message);
    throw error;
  }
}
