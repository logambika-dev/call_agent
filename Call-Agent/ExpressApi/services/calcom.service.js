import axios from "axios";
import logger from "../utils/logger.js";

/**
 * Cal.com API Integration Service
 */
class CalComService {
    constructor() {
        this.apiKey = process.env.CALCOM_API_KEY;
        this.baseUrl = "https://api.cal.com/v1";
    }

    /**
     * Create a booking via Cal.com API
     * @param {Object} params - Booking parameters
     * @returns {Object} Booking details with meeting link
     */
    async createBooking({ contactName, contactEmail, scheduledAt, duration = 30 }) {
        try {
            if (!this.apiKey) {
                throw new Error("Cal.com API key not configured");
            }

            logger.info(`### Creating Cal.com booking for ${contactEmail}`);

            const response = await axios.post(
                `${this.baseUrl}/bookings`,
                {
                    eventTypeId: process.env.CALCOM_EVENT_TYPE_ID || 1,
                    start: new Date(scheduledAt).toISOString(),
                    responses: {
                        name: contactName,
                        email: contactEmail,
                    },
                    timeZone: "Asia/Kolkata",
                    language: "en",
                    metadata: {
                        source: "aisdr_elevenlabs"
                    }
                },
                {
                    headers: {
                        "Authorization": `Bearer ${this.apiKey}`,
                        "Content-Type": "application/json"
                    }
                }
            );

            const booking = response.data;
            logger.info(`### Cal.com booking created: ${booking.id}`);

            return {
                success: true,
                bookingId: booking.id,
                meetingLink: booking.meetingUrl || booking.url,
                scheduledAt: booking.startTime,
                booking
            };

        } catch (error) {
            logger.error(`### Cal.com booking error: ${error.message}`);
            if (error.response) {
                logger.error(`### Cal.com API response: ${JSON.stringify(error.response.data)}`);
            }
            throw error;
        }
    }

    /**
     * Get booking details
     */
    async getBooking(bookingId) {
        try {
            const response = await axios.get(
                `${this.baseUrl}/bookings/${bookingId}`,
                {
                    headers: {
                        "Authorization": `Bearer ${this.apiKey}`
                    }
                }
            );

            return { success: true, booking: response.data };
        } catch (error) {
            logger.error(`### Error fetching Cal.com booking: ${error.message}`);
            throw error;
        }
    }

    /**
     * Cancel a booking
     */
    async cancelBooking(bookingId, reason = "Cancelled by system") {
        try {
            await axios.delete(
                `${this.baseUrl}/bookings/${bookingId}`,
                {
                    headers: {
                        "Authorization": `Bearer ${this.apiKey}`
                    },
                    data: { reason }
                }
            );

            logger.info(`### Cal.com booking ${bookingId} cancelled`);
            return { success: true };
        } catch (error) {
            logger.error(`### Error cancelling Cal.com booking: ${error.message}`);
            throw error;
        }
    }
}

export default new CalComService();
