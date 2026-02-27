import prisma from "../prisma/client.js";
import axios from "axios";
import config from "../config/index.js";
// import emailIntegrationService from "../../services/v1/emailIntegration.service.js";
import emailIntegrationService from "../services/emailIntegration.service.js"
import meetingService from "../services/meeting.service.js";
import calcomService from "../services/calcom.service.js";

export const makeCall = async (req, res) => {
  try {
    const userId = req.user.id; // Get user from authentication middleware
    let { contactId } = req.body;

    // Validate contactId
    if (!contactId) {
      return res.status(400).json({ success: false, message: "contactId is required" });
    }

    console.log(`### Make Call - Received contactId: ${contactId}, userId: ${userId}`);

    // Verify contact exists - try both number and as-is
    let contact;
    try {
      // First try as integer
      contact = await prisma.contact.findUnique({
        where: { id: typeof contactId === 'string' ? parseInt(contactId, 10) : contactId },
        include: { campaigns: true }
      });
    } catch (e) {
      console.error("### Error looking up contact as integer:", e.message);
      // If that fails, the contact doesn't exist
      contact = null;
    }

    if (!contact) {
      console.log(`### Contact not found with id: ${contactId}`);
      return res.status(404).json({ success: false, message: "Contact not found" });
    }

    // Validate phone number
    if (!contact.phoneNumber) {
      return res.status(400).json({ success: false, message: "Contact has no phone number" });
    }

    console.log(`### Making call to ${contact.firstName} (${contact.phoneNumber}) for user ${userId}`);

    let response;
    try {
      response = await axios.post(`${config.aiService.url}/api/v1/agent/call`, {
        phone: contact.phoneNumber,
        name: contact.firstName,
        email: contact.email,
        company: contact.companyName,
      });
    } catch (axiosError) {
      console.error(`### AI Service call failed:`, axiosError.response?.data || axiosError.message);
      return res.status(503).json({
        success: false,
        message: "AI service unavailable. Please try again later.",
        details: axiosError.response?.data?.message || axiosError.message
      });
    }

    if (!response.data || response.data.success === false) {
      console.error("### AI Service returned failure:", response.data);
      return res.status(400).json({
        success: false,
        message: "Failed to initiate call via AI agent",
        details: response.data?.error || "Unknown error"
      });
    }

    // Create call log
    const callLog = await prisma.callLog.create({
      data: {
        contactId: contact.id,
        userId,
        callId: response.data.call_id || `call_${Date.now()}`,
        status: response.data.status || "initiated",
        outcome: response.data.outcome || null,
        transcript: "",
        direction: "outbound",
      },
    });

    console.log(`### Call log created: ${callLog.callId}`);

    // Create task if qualified
    if (response.data.qualified && response.data.meeting_scheduled) {
      await prisma.task.create({
        data: {
          contactId: contact.id,
          userId,
          type: "meeting_scheduled",
          title: `Meeting scheduled with ${contact.firstName}`,
          description: `Call outcome: ${response.data.outcome}. Meeting link sent via email.`,
          status: "pending",
        },
      });
    }

    res.json({ success: true, callLog, qualified: response.data.qualified || false });
  } catch (error) {
    console.error("### Make Call Error:", error.message, error.stack);
    res.status(500).json({
      success: false,
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

export const getCallLogs = async (req, res) => {
  try {
    const { userId } = req.query;
    const logs = await prisma.callLog.findMany({
      where: { userId },
      include: { contact: true },
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, logs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateCallStatus = async (req, res) => {
  try {
    const { callId, transcript, outcome, meeting_time, meeting_link, meeting_id } = req.body;

    const callLog = await prisma.callLog.update({
      where: { callId },
      data: { transcript, outcome, status: "completed" },
    });

    if (outcome === "interested") {
      const existingTask = await prisma.task.findFirst({
        where: { contactId: callLog.contactId, type: "meeting_scheduled" },
      });

      if (!existingTask) {
        await prisma.task.create({
          data: {
            contactId: callLog.contactId,
            userId: callLog.userId,
            type: "meeting_scheduled",
            title: "Follow up on call interest",
            description: `Contact showed interest during call. Transcript: ${transcript}`,
            status: "pending",
          },
        });
      }

      // --- Post-Call Email Logic ---
      try {
        const contact = await prisma.contact.findUnique({ where: { id: callLog.contactId } });
        const user = await prisma.user.findUnique({ where: { id: callLog.userId } });

        if (contact && user) {
          // Find a connected email account to send from
          const emailAccount = await prisma.emailAccount.findFirst({
            where: { user_id: user.id, status: "connected" }
          });

          if (emailAccount) {
            // 1. Email to Client (Meeting Confirmation)
            const clientSubject = `Meeting Confirmation: ${config.companyName || "Our Meeting"}`;
            const clientBody = `
              <p>Hi ${contact.firstName},</p>
              <p>Thank you for your interest! We are excited to speak with you.</p>
              <p><strong>Meeting Details:</strong></p>
              <ul>
                <li><strong>Date/Time:</strong> ${meeting_time || "To be scheduled"}</li>
                <li><strong>Link:</strong> ${meeting_link || "Will be shared shortly"}</li>
                ${meeting_id ? `<li><strong>Meeting ID:</strong> ${meeting_id}</li>` : ""}
              </ul>
              <p>Please let us know if you have any questions before then.</p>
              

              <p>Best regards,</p>
              <p>${user.name || "The Team"}</p>
            `;

            await emailIntegrationService.sendEmail(user.id, emailAccount.id.toString(), {
              to: [contact.email],
              subject: clientSubject,
              body: clientBody
            });

            // 2. Email to User (Lead Context)
            const userSubject = `New Interested Lead (Call Agent): ${contact.firstName} ${contact.lastName}`;
            const userBody = `
              <h3>Call Agent Success</h3>
              <p><strong>Contact:</strong> ${contact.firstName} ${contact.lastName} (${contact.email})</p>
              <p><strong>Company:</strong> ${contact.companyName}</p>
              <p><strong>Outcome:</strong> Interested</p>
              <hr/>
              <p><strong>Meeting Scheduled:</strong> ${meeting_time || "N/A"}</p>
              <p><strong>Transcript Summary/Context:</strong></p>
              <blockquote style="background: #f9f9f9; padding: 10px; border-left: 3px solid #ccc;">
                ${transcript ? transcript.substring(0, 500) + "..." : "No transcript available."}
              </blockquote>
              <p>Please check the portal for full details.</p>
            `;

            await emailIntegrationService.sendEmail(user.id, emailAccount.id.toString(), {
              to: [user.email],
              subject: userSubject,
              body: userBody
            });

            console.log(`### Post-Call emails sent for contact ${contact.id}`);
          } else {
            console.warn(`### No connected email account found for user ${user.id} to send post-call emails.`);
          }
        }
      } catch (emailError) {
        console.error("### Failed to send post-call emails:", emailError);
        // Continue execution, don't fail the request
      }
    }

    res.json({ success: true, callLog });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
* Trigger call when user replies to email as interested
*/
export const handleEmailReplyTrigger = async (req, res) => {
  try {
    const userId = req.user.id;
    const { contactId, emailContent } = req.body;

    if (!contactId) {
      return res.status(400).json({ success: false, message: "contactId required" });
    }

    const contact = await prisma.contact.findUnique({ where: { id: contactId } });
    if (!contact || !contact.phoneNumber) {
      return res.status(400).json({ success: false, message: "Contact not found or no phone" });
    }

    console.log(`### Email Reply Trigger - Calling ${contact.firstName}`);

    const response = await axios.post(`${config.aiService.url}/api/v1/agent/call`, {
      phone: contact.phoneNumber,
      name: contact.firstName,
      email: contact.email,
      company: contact.companyName,
      context: { trigger: "email_reply", emailContent, contactId, userId }
    });

    const callLog = await prisma.callLog.create({
      data: {
        contactId,
        userId,
        callId: response.data.call_id || `call_${Date.now()}`,
        status: response.data.status || "initiated",
        outcome: null,
        transcript: "",
        direction: "outbound",
      },
    });

    res.json({ success: true, callLog, message: "Call initiated from email reply" });
  } catch (error) {
    console.error("### Email Reply Trigger Error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
* Webhook handler for call outcomes from AI Call Agent
*/
export const handleCallOutcome = async (req, res) => {
  try {
    const { call_id, contact_id, user_id, outcome, picked, transcript } = req.body;
    console.log(`### Webhook - Call: ${call_id}, Outcome: ${outcome}, Picked: ${picked}`);

    if (!call_id) {
      return res.status(400).json({ success: false, message: "call_id required" });
    }

    const callLog = await prisma.callLog.findFirst({ where: { callId: call_id } });
    if (!callLog) {
      return res.status(404).json({ success: false, message: "Call log not found" });
    }

    await prisma.callLog.update({
      where: { id: callLog.id },
      data: { outcome, transcript: transcript || "", status: "completed" }
    });

    // If interested, trigger meeting flow
    if (outcome === "interested" && picked) {
      const contact = await prisma.contact.findUnique({ where: { id: callLog.contactId } });
      const user = await prisma.user.findUnique({ where: { id: callLog.userId } });
      const emailAccount = await prisma.emailAccount.findFirst({
        where: { user_id: user.id, status: "connected" }
      });

      if (contact && user) {
        // Generate meeting details using Cal.com
        const meetingTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
        meetingTime.setHours(10, 0, 0, 0);

        // Skip weekends
        if (meetingTime.getDay() === 6) meetingTime.setDate(meetingTime.getDate() + 2);
        if (meetingTime.getDay() === 0) meetingTime.setDate(meetingTime.getDate() + 1);

        console.log(`### Creating Cal.com booking for ${contact.email}...`);
        
        let meetingLink;
        try {
          const calcomBooking = await calcomService.createBooking({
            contactName: `${contact.firstName} ${contact.lastName}`,
            contactEmail: contact.email,
            scheduledAt: meetingTime,
            duration: 30
          });
          
          meetingLink = calcomBooking.meetingLink;
          console.log(`### Cal.com booking created: ${meetingLink}`);
        } catch (calcomError) {
          console.error(`### Cal.com booking failed, falling back to Google Meet: ${calcomError.message}`);
          meetingLink = await meetingService.generateMeetingLink({
            contactName: `${contact.firstName} ${contact.lastName}`,
            contactEmail: contact.email,
            companyName: contact.companyName || "Client",
            scheduledAt: meetingTime
          });
        }

        const duration = "30 minutes";

        // Send invitations from system email (demo email)
        console.log(`### Sending meeting invitations via MeetingService...`);
        try {
          await meetingService.sendMeetingInvites({
            contactId: contact.id,
            userId: user.id,
            meetingLink,
            scheduledAt: meetingTime
          });
          console.log(`### Meeting invitations sent successfully`);
        } catch (inviteError) {
          console.error(`### Error sending meeting invites:`, inviteError.message);
          // Still create the task even if email fails
        }

        // Create task
        await prisma.task.create({
          data: {
            contactId: contact.id,
            userId: user.id,
            type: "meeting_scheduled",
            title: `Meeting with ${contact.firstName} ${contact.lastName}`,
            description: `Meeting at ${new Date(meetingTime).toLocaleString()}. Link: ${meetingLink}`,
            status: "pending",
          },
        });

        console.log(`### Meeting emails sent for contact ${contact.id}`);
      }
    }

    return res.json({ success: true, message: "Call outcome processed" });
  } catch (error) {
    console.error("### Webhook Error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};