// import logger from "../../utils/logger.js";
import logger from "../utils/logger.js"
import prisma from "../prisma/client.js";
import axios from "axios";
import config from "../config/index.js";
import nodemailer from "nodemailer";

/**
 * Service to handle meeting scheduling and notifications
 */
class MeetingService {
    /**
     * Create a meeting record
     * @param {Object} params - Meeting parameters
     * @returns {Object} Created meeting
     */
    async createMeeting({ contactId, userId, campaignId, scheduledAt, meetingLink, attendees }) {
        try {
            logger.info(`### Creating meeting for contact ${contactId}`);

            const meeting = await prisma.meeting.create({
                data: {
                    contactId: parseInt(contactId),
                    userId,
                    campaignId: campaignId ? parseInt(campaignId) : null,
                    scheduledAt: new Date(scheduledAt),
                    meetingLink,
                    status: "scheduled",
                    attendees: attendees || {}
                }
            });

            logger.info(`### Meeting created successfully: ${meeting.id}`);
            return { success: true, meeting };
        } catch (error) {
            logger.error(`### Error creating meeting: ${error.message}`);
            throw error;
        }
    }

    /**
     * Generate real Google Meet link using Google Calendar API
     * @param {Object} options - Meeting options
     * @param {string} options.contactName - Contact's name
     * @param {string} options.contactEmail - Contact's email
     * @param {string} options.companyName - Company name
     * @param {Date} options.scheduledAt - Scheduled time
     * @returns {Object} Meeting link and details
     */
    async generateMeetingLink(options = {}) {
        try {
            const {
                contactName = "Customer",
                contactEmail = "",
                companyName = "Demo",
                scheduledAt = null
            } = options;

            // Get Google credentials from environment
            const clientId = config.googleApi.clientId;
            const clientSecret = config.googleApi.clientSecret;
            const refreshToken = config.googleApi.refreshToken;
            const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";

            if (!clientId || !clientSecret || !refreshToken) {
                logger.warn("### Google API credentials not configured, using placeholder link");
                const meetingId = `meet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                return `https://meet.google.com/${meetingId}`;
            }

            // Step 1: Get access token from refresh token
            logger.info("### Getting Google access token...");
            const tokenResponse = await axios.post("https://oauth2.googleapis.com/token", {
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: refreshToken,
                grant_type: "refresh_token"
            });

            const accessToken = tokenResponse.data.access_token;
            logger.info("### Got access token successfully");

            // Step 2: Create calendar event with Google Meet
            const startTime = scheduledAt ? new Date(scheduledAt) : new Date(Date.now() + 24 * 60 * 60 * 1000);
            startTime.setHours(10, 0, 0, 0);

            // Skip weekends
            if (startTime.getDay() === 6) startTime.setDate(startTime.getDate() + 2);
            if (startTime.getDay() === 0) startTime.setDate(startTime.getDate() + 1);

            const endTime = new Date(startTime.getTime() + 30 * 60 * 1000); // 30 minutes

            const event = {
                summary: `Demo Meeting - ${companyName}`,
                description: `Product demo with ${contactName} from ${companyName}.\n\nScheduled automatically by AI SDR.`,
                start: {
                    dateTime: startTime.toISOString(),
                    timeZone: "Asia/Kolkata"
                },
                end: {
                    dateTime: endTime.toISOString(),
                    timeZone: "Asia/Kolkata"
                },
                attendees: contactEmail ? [{ email: contactEmail }] : [],
                conferenceData: {
                    createRequest: {
                        requestId: `meet-${Date.now()}`,
                        conferenceSolutionKey: { type: "hangoutsMeet" }
                    }
                },
                reminders: {
                    useDefault: false,
                    overrides: [
                        { method: "email", minutes: 60 },
                        { method: "popup", minutes: 15 }
                    ]
                }
            };

            logger.info("### Creating Google Calendar event with Meet link...");
            const eventResponse = await axios.post(
                `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?conferenceDataVersion=1`,
                event,
                {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        "Content-Type": "application/json"
                    }
                }
            );

            const eventData = eventResponse.data;
            const meetLink = eventData.hangoutLink ||
                eventData.conferenceData?.entryPoints?.[0]?.uri ||
                `https://meet.google.com/meet-${Date.now()}`;

            logger.info(`### Real Google Meet link created: ${meetLink}`);
            logger.info(`### Calendar Event ID: ${eventData.id}`);

            return meetLink;

        } catch (error) {
            logger.error(`### Error creating Google Meet link: ${error.message}`);
            if (error.response) {
                logger.error(`### Google API Error: ${JSON.stringify(error.response.data)}`);
            }

            // Fallback to placeholder if API fails
            const meetingId = `meet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            logger.info(`### Using fallback placeholder link`);
            return `https://meet.google.com/${meetingId}`;
        }
    }

    /**
     * Generate .ics calendar file content
     * @param {Object} meeting - Meeting details
     * @param {Object} contact - Contact details
     * @returns {string} ICS file content
     */
    generateICSFile(meeting, contact) {
        console.log(`### Generating ICS file for meeting ${meeting.id}`);
        const startDate = new Date(meeting.scheduledAt);
        const endDate = new Date(startDate.getTime() + 30 * 60000); // 30 minutes

        const formatDate = (date) => {
            return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        };

        const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//AI SDR//Meeting Scheduler//EN
CALSCALE:GREGORIAN
METHOD:REQUEST
BEGIN:VEVENT
UID:${meeting.id}@aisdr.com
DTSTAMP:${formatDate(new Date())}
DTSTART:${formatDate(startDate)}
DTEND:${formatDate(endDate)}
SUMMARY:Meeting with ${contact.firstName} ${contact.lastName}
DESCRIPTION:Scheduled meeting via AI SDR\\n\\nJoin: ${meeting.meetingLink}
LOCATION:${meeting.meetingLink}
STATUS:CONFIRMED
SEQUENCE:0
BEGIN:VALARM
TRIGGER:-PT15M
ACTION:DISPLAY
DESCRIPTION:Reminder: Meeting in 15 minutes
END:VALARM
END:VEVENT
END:VCALENDAR`;

        return icsContent;
    }

    /**
     * Send meeting invitations to all attendees.
     * Supports both persistent (DB record) and ephemeral (on-the-fly) flows.
     * @param {number|Object} input - Meeting ID OR an object with { contactId, campaignId, meetingLink, scheduledAt }
     * @returns {Object} Result
     */
    async sendMeetingInvites(input, campaignId = null, meetingLink = null, scheduledAt = null) {
        try {
            let meeting;
            let contact;
            let companyRepEmail = process.env.COMPANY_MEETING_ATTENDEE || "sales@yourcompany.com";

            // Determine if we are in Ephemeral Mode or DB Mode
            if (typeof input === 'object' || meetingLink) {
                // EPHEMERAL MODE (No DB Save)
                const data = typeof input === 'object' ? input : { contactId: input, campaignId, meetingLink, scheduledAt };
                logger.info(`### Ephemeral flow: Sending meeting invites for contact ${data.contactId}`);

                contact = await prisma.contact.findUnique({ where: { id: parseInt(data.contactId) } });
                if (!contact) throw new Error(`Contact ${data.contactId} not found`);

                meeting = {
                    id: `temp_${contact.id}_${Date.now()}`,
                    meetingLink: data.meetingLink,
                    scheduledAt: data.scheduledAt || this.getNextBusinessDay()
                };

                // Fetch rep email for ephemeral flow
                // if (data.campaignId) {
                //     const campaign = await prisma.campaign.findUnique({
                //         where: { id: parseInt(data.campaignId) }
                //     });
                //     if (campaign && campaign.userId) {
                //         const user = await prisma.user.findUnique({
                //             where: { id: campaign.userId }
                //         });
                //         if (user?.email) companyRepEmail = user.email;
                //     }
                // }
            } else {
                // DB MODE (Persistent)
                logger.info(`### DB flow: Sending meeting invites for meeting ID ${input}`);
                meeting = await prisma.meeting.findUnique({ where: { id: parseInt(input) } });
                if (!meeting) throw new Error(`Meeting ${input} not found`);

                contact = await prisma.contact.findUnique({ where: { id: meeting.contactId } });
                if (!contact) throw new Error(`Contact ${meeting.contactId} not found`);

                if (meeting.campaignId) {
                    const campaign = await prisma.campaign.findUnique({
                        where: { id: meeting.campaignId }
                    });
                    if (campaign && campaign.userId) {
                        const user = await prisma.user.findUnique({
                            where: { id: campaign.userId }
                        });
                        if (user?.email) companyRepEmail = user.email;
                    }
                }
            }

            // Generate ICS file
            const icsContent = this.generateICSFile(meeting, contact);

            // Send email to customer
            logger.info(`### Sending meeting invite to customer: ${contact.email}`);
            const customerEmailResult = await this.sendEmailInvite({
                to: contact.email,
                subject: `Meeting Invitation - ${new Date(meeting.scheduledAt).toLocaleDateString()}`,
                body: this.generateCustomerEmailBody(meeting, contact),
                icsContent,
                contactName: `${contact.firstName} ${contact.lastName}`
            });
            console.log(customerEmailResult, "##### customerEmailResult");

            if (!customerEmailResult.success) {
                logger.error(`### Failed to send email to customer ${contact.email}`);
                logger.error(`### Error Details: ${customerEmailResult.error}`);
                if (customerEmailResult.hint) {
                    logger.error(`### Hint: ${customerEmailResult.hint}`);
                }
                if (customerEmailResult.config_summary) {
                    logger.error(`### SMTP Config Summary:`, JSON.stringify(customerEmailResult.config_summary, null, 2));
                }
                throw new Error(`Customer email failed: ${customerEmailResult.error}\nHint: ${customerEmailResult.hint || 'Check SMTP configuration'}`);
            }

            logger.info(`### Successfully sent email to customer. Message ID: ${customerEmailResult.messageId}`);

            // Send email to company representative
            logger.info(`### Sending meeting notification to company rep: ${companyRepEmail}`);
            const companyEmailResult = await this.sendEmailInvite({
                to: companyRepEmail,
                subject: `New Meeting Scheduled with ${contact.firstName} ${contact.lastName}`,
                body: this.generateCompanyEmailBody(meeting, contact),
                icsContent,
                contactName: companyRepEmail
            });

            if (!companyEmailResult.success) {
                logger.error(`### Failed to send email to company rep ${companyRepEmail}`);
                logger.error(`### Error Details: ${companyEmailResult.error}`);
                if (companyEmailResult.hint) {
                    logger.error(`### Hint: ${companyEmailResult.hint}`);
                }
                if (companyEmailResult.config_summary) {
                    logger.error(`### SMTP Config Summary:`, JSON.stringify(companyEmailResult.config_summary, null, 2));
                }
                throw new Error(`Company rep email failed: ${companyEmailResult.error}\nHint: ${companyEmailResult.hint || 'Check SMTP configuration'}`);
            }

            logger.info(`### Successfully sent email to company rep. Message ID: ${companyEmailResult.messageId}`);
            logger.info(`### Meeting invites sent successfully for contact ${contact.id}`);
            return { success: true };
        } catch (error) {
            logger.error(`### Error sending meeting invites: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get next business day at 10 AM
     */
    getNextBusinessDay() {
        const date = new Date();
        date.setDate(date.getDate() + 1); // Tomorrow
        date.setHours(10, 0, 0, 0); // 10 AM

        // If it's Saturday, move to Monday
        if (date.getDay() === 6) {
            date.setDate(date.getDate() + 2);
        }
        // If it's Sunday, move to Monday
        else if (date.getDay() === 0) {
            date.setDate(date.getDate() + 1);
        }

        return date;
    }

    /**
     * Generate email body for customer
     */
    generateCustomerEmailBody(meeting, contact) {
        const meetingDate = new Date(meeting.scheduledAt);
        const formattedDate = meetingDate.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        const formattedTime = meetingDate.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short'
        });

        return `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .meeting-details { background-color: white; padding: 15px; margin: 20px 0; border-left: 4px solid #4CAF50; }
        .button { display: inline-block; padding: 12px 24px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 4px; margin: 10px 0; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Meeting Confirmed!</h1>
        </div>
        <div class="content">
            <p>Hi ${contact.firstName},</p>
            <p>Great news! Your meeting has been scheduled.</p>
            
            <div class="meeting-details">
                <h3>Meeting Details</h3>
                <p><strong>Date:</strong> ${formattedDate}</p>
                <p><strong>Time:</strong> ${formattedTime}</p>
                <p><strong>Duration:</strong> 30 minutes</p>
            </div>
            
            <p>Join the meeting using the link below:</p>
            <a href="${meeting.meetingLink}" class="button">Join Meeting</a>
            
            <p>A calendar invitation has been attached to this email. Please add it to your calendar.</p>
            
            <p>Looking forward to speaking with you!</p>
        </div>
        <div class="footer">
            <p>If you need to reschedule, please reply to this email.</p>
        </div>
    </div>
</body>
</html>
        `;
    }

    /**
     * Generate email body for company representative
     */
    generateCompanyEmailBody(meeting, contact) {
        const meetingDate = new Date(meeting.scheduledAt);
        const formattedDate = meetingDate.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        const formattedTime = meetingDate.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short'
        });

        return `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #2196F3; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .contact-info { background-color: white; padding: 15px; margin: 20px 0; border-left: 4px solid #2196F3; }
        .button { display: inline-block; padding: 12px 24px; background-color: #2196F3; color: white; text-decoration: none; border-radius: 4px; margin: 10px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>New Meeting Scheduled</h1>
        </div>
        <div class="content">
            <p>A new meeting has been automatically scheduled by the AI SDR system.</p>
            
            <div class="contact-info">
                <h3>Contact Information</h3>
                <p><strong>Name:</strong> ${contact.firstName} ${contact.lastName}</p>
                <p><strong>Email:</strong> ${contact.email}</p>
                <p><strong>Company:</strong> ${contact.companyName || 'N/A'}</p>
                <p><strong>Title:</strong> ${contact.jobTitle || 'N/A'}</p>
            </div>
            
            <div class="contact-info">
                <h3>Meeting Details</h3>
                <p><strong>Date:</strong> ${formattedDate}</p>
                <p><strong>Time:</strong> ${formattedTime}</p>
                <p><strong>Duration:</strong> 30 minutes</p>
            </div>
            
            <a href="${meeting.meetingLink}" class="button">Join Meeting</a>
            
            <p>A calendar invitation has been attached. Please review the contact information and prepare accordingly.</p>
        </div>
    </div>
</body>
</html>
        `;
    }

    /**
     * Send email with calendar invite
     */
    async sendEmailInvite({ to, subject, body, icsContent, contactName }) {
        try {
            // Validate email address
            if (!to || !to.includes('@')) {
                logger.warn(`### Invalid email address for ${contactName}: ${to}`);
                return {
                    success: false,
                    error: `Invalid email address: ${to}`,
                    to,
                    contactName
                };
            }

            logger.info(`### Configuring email transporter for ${to}`);

            // Verify email configuration
            if (!config.emailService.host || !config.emailService.user || !config.emailService.password) {
                logger.error('### Email service not properly configured. Check SMTP_HOST, SMTP_USER, SMTP_PASSWORD in .env');
                return {
                    success: false,
                    error: 'Email service not configured. Required: SMTP_HOST, SMTP_USER, SMTP_PASSWORD',
                    to,
                    contactName,
                    hint: 'For Gmail: Use an App Password (not regular password). Enable 2FA and generate at https://myaccount.google.com/apppasswords'
                };
            }

            // Detect if Gmail is being used and provide guidance
            const isGmail = config.emailService.host?.includes('gmail') || config.emailService.user?.includes('@gmail.com');
            const appPasswordHint = isGmail ? 'Gmail detected: Make sure you\'re using an App Password, not your regular password.' : '';

            logger.info(`### SMTP Config: host=${config.emailService.host}, user=${config.emailService.user}, port=${config.emailService.port}`);

            const transporter = nodemailer.createTransport({
                host: config.emailService.host,
                port: config.emailService.port || 587,
                secure: config.emailService.secure !== true ? false : true,  // Use TLS for port 587
                auth: {
                    user: config.emailService.user,
                    pass: config.emailService.password
                },
                connectionTimeout: 10000,  // 10 seconds
                socketTimeout: 15000,      // 15 seconds
                logger: process.env.NODE_ENV === 'development',  // Enable debug logging in dev
                debug: process.env.NODE_ENV === 'development'
            });

            logger.info(`### Testing SMTP connection for ${to}...`);
            // Test connection before sending
            try {
                await transporter.verify();
                logger.info(`### SMTP connection verified successfully`);
            } catch (verifyError) {
                const errorMsg = verifyError.message || '';
                logger.error(`### SMTP verification failed: ${errorMsg}`);

                // Provide specific guidance based on error type
                let hint = 'Check SMTP credentials in .env file.';
                if (errorMsg.includes('Invalid login') || errorMsg.includes('535')) {
                    hint = isGmail
                        ? 'Gmail: Use an App Password instead of regular password. Go to https://myaccount.google.com/apppasswords (requires 2FA enabled)'
                        : 'Check username and password for your email provider';
                } else if (errorMsg.includes('ECONNREFUSED') || errorMsg.includes('getaddrinfo')) {
                    hint = `Cannot connect to SMTP server: ${config.emailService.host}:${config.emailService.port}. Check SMTP_HOST and SMTP_PORT.`;
                } else if (errorMsg.includes('EHLO') || errorMsg.includes('SMTP')) {
                    hint = `SMTP server error. Verify ${config.emailService.host} is a valid SMTP endpoint.`;
                }

                logger.error(`### Hint: ${hint}`);

                return {
                    success: false,
                    error: `SMTP verification failed: ${errorMsg}`,
                    to,
                    contactName,
                    hint,
                    config_summary: {
                        host: config.emailService.host,
                        port: config.emailService.port,
                        user: config.emailService.user ? config.emailService.user.substring(0, 3) + '***' : 'NOT SET',
                        isGmail
                    }
                };
            }

            const mailOptions = {
                from: config.emailService.from || config.emailService.user || 'noreply@aisdr.com',
                to,
                subject,
                html: body,
                icalEvent: {
                    filename: 'meeting.ics',
                    method: 'REQUEST',
                    content: icsContent
                }
            };

            logger.info(`### Sending email to ${to} with subject: "${subject}"`);
            const result = await transporter.sendMail(mailOptions);
            logger.info(`### Email successfully sent to ${to}. Message ID: ${result.messageId}`);

            await transporter.close();

            return {
                success: true,
                to,
                contactName,
                messageId: result.messageId
            };

        } catch (error) {
            const errorMsg = error.message || JSON.stringify(error);
            logger.error(`### Error sending email to ${to}: ${errorMsg}`);
            logger.error(`### Stack trace: ${error.stack}`);

            // Provide helpful error context
            let hint = 'Check logs for more details.';
            if (errorMsg.includes('Invalid login') || errorMsg.includes('535')) {
                hint = isGmail
                    ? 'Gmail SMTP Error: Use an App Password instead of regular password. Enable 2FA and generate one at https://myaccount.google.com/apppasswords'
                    : 'Invalid SMTP credentials. Check SMTP_USER and SMTP_PASSWORD.';
            } else if (errorMsg.includes('ENOTFOUND')) {
                hint = `SMTP host not found: ${config.emailService.host}`;
            }

            return {
                success: false,
                error: errorMsg,
                to,
                contactName,
                hint,
                isGmail: typeof isGmail !== 'undefined' ? isGmail : undefined
            };
        }
    }

    /**
     * Get meetings for a user
     */
    async getMeetings(userId, status = null) {
        try {
            const where = { userId };
            if (status) {
                where.status = status;
            }

            const meetings = await prisma.meeting.findMany({
                where,
                orderBy: { scheduledAt: 'asc' }
            });

            return { success: true, meetings };
        } catch (error) {
            logger.error(`### Error fetching meetings: ${error.message}`);
            throw error;
        }
    }

    /**
     * Update meeting status
     */
    async updateMeetingStatus(meetingId, status) {
        try {
            const meeting = await prisma.meeting.update({
                where: { id: meetingId },
                data: { status }
            });

            return { success: true, meeting };
        } catch (error) {
            logger.error(`### Error updating meeting status: ${error.message}`);
            throw error;
        }
    }
}

export default new MeetingService();
