let express = require("express");
let router = express.Router();
let path = require("path");
let fs = require("fs");
let multer = require("multer");
let messageModel = require("../schemas/messages");
let userController = require("../controllers/users");
const { checkLogin } = require("../utils/authHandler");

const uploadDir = path.join(__dirname, "../uploads/messages");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const messageUpload = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
      let ext = path.extname(file.originalname || "");
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 }
});

router.get("/", checkLogin, async function (req, res, next) {
  try {
    let currentUserId = req.user._id.toString();
    let allMessages = await messageModel
      .find({
        $or: [{ from: req.user._id }, { to: req.user._id }]
      })
      .sort({ createdAt: -1 })
      .populate("from to", "username email");

    let latestByUser = new Map();
    for (let message of allMessages) {
      let fromId = message.from._id.toString();
      let toId = message.to._id.toString();
      let otherUserId = fromId === currentUserId ? toId : fromId;
      if (!latestByUser.has(otherUserId)) {
        latestByUser.set(otherUserId, message);
      }
    }

    res.send(Array.from(latestByUser.values()));
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});

router.get("/:userID", checkLogin, async function (req, res, next) {
  try {
    let userID = req.params.userID;
    let targetUser = await userController.FindUserById(userID);
    if (!targetUser) {
      return res.status(404).send({ message: "Nguoi nhan khong ton tai" });
    }

    let messages = await messageModel
      .find({
        $or: [
          { from: req.user._id, to: userID },
          { from: userID, to: req.user._id }
        ]
      })
      .sort({ createdAt: 1 })
      .populate("from to", "username email");

    res.send(messages);
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});

router.post("/:userID", checkLogin, messageUpload.single("file"), async function (req, res, next) {
  try {
    let to = req.params.userID;
    let targetUser = await userController.FindUserById(to);
    if (!targetUser) {
      return res.status(404).send({ message: "Nguoi nhan khong ton tai" });
    }

    let contentType = "text";
    let contentText = (req.body.text || "").trim();
    if (req.file) {
      contentType = "file";
      contentText = req.file.path;
    }

    if (!contentText) {
      return res.status(400).send({ message: "Noi dung tin nhan khong duoc de trong" });
    }

    let newMessage = new messageModel({
      from: req.user._id,
      to: to,
      messageContent: {
        type: contentType,
        text: contentText
      }
    });

    await newMessage.save();
    await newMessage.populate("from to", "username email");
    res.send(newMessage);
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});

module.exports = router;
