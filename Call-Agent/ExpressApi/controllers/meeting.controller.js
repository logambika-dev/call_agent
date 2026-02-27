// import prisma from "../../prisma/client.js";
// import meetingService from "../../services/v1/meeting.service.js";
import meetingService from "../services/meeting.service.js"

export const getMeetings = async (req, res) => {
    try {
        const userId = req.user.id;
        const { status } = req.query;

        const result = await meetingService.getMeetings(userId, status);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const updateMeetingStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const result = await meetingService.updateMeetingStatus(parseInt(id), status);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
