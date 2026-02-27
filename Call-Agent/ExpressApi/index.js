import express from "express"
import meetingRoutes from "./routes/meeting.routes.js";
import callAgentRoutes from "./routes/callagent.routes.js";

const router = express.Router();

router.use("/call-agent", callAgentRoutes);
router.use("/meetings", meetingRoutes);

export default router;
