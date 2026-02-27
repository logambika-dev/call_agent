import express from "express";
import {getMeetings, updateMeetingStatus} from "./../controllers/meeting.controller.js"
import { userAuthenticate as userAuth} from "./../security/passport.js"

const router = express.Router();

router.get("/", userAuth, getMeetings);
router.patch("/:id", userAuth, updateMeetingStatus);

export default router;
