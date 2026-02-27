import express from "express";

// import { makeCall, getCallLogs, updateCallStatus, handleCallOutcome, handleEmailReplyTrigger } from "../../controllers/v1/callAgent.controller.js";
import { makeCall, getCallLogs, updateCallStatus, handleCallOutcome, handleEmailReplyTrigger } from "../controllers/callAgent.controller.js"

import { userAuthenticate } from "../security/passport.js";

const router = express.Router();

router.post("/make-call", userAuthenticate, makeCall);
router.post("/email-reply-trigger", userAuthenticate, handleEmailReplyTrigger);
router.get("/logs", userAuthenticate, getCallLogs);
router.post("/update-status", userAuthenticate, updateCallStatus);
router.post("/webhook/outcome", handleCallOutcome);

export default router;