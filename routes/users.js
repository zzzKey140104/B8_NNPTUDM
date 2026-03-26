var express = require("express");
var router = express.Router();
let { validatedResult, CreateUserValidator, ModifyUserValidator } = require("../utils/validator")
let userModel = require("../schemas/users");
let userController = require("../controllers/users");
let roleModel = require("../schemas/roles");
const { checkLogin,checkRole } = require("../utils/authHandler");
let multer = require("multer");
let crypto = require("crypto");
let XLSX = require("xlsx");
let { sendPasswordMail } = require("../utils/mailHandler");

const uploadImport = multer({ storage: multer.memoryStorage() });

function parseCsvUsers(fileContent) {
  let lines = fileContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return [];
  }

  if (lines[0].toLowerCase() === "username,email") {
    lines = lines.slice(1);
  }

  return lines.map((line, index) => {
    let parts = line.split(",").map((part) => part.trim());
    if (parts.length < 2 || !parts[0] || !parts[1]) {
      throw new Error(`Dong CSV khong hop le tai vi tri ${index + 1}`);
    }
    return {
      username: parts[0],
      email: parts[1]
    };
  });
}

function parseExcelUsers(fileBuffer) {
  const workbook = XLSX.read(fileBuffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return [];
  }

  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
  return rows
    .map((row, index) => {
      const username = String(row.username || "").trim();
      const email = String(row.email || "").trim();
      if (!username || !email) {
        throw new Error(`Dong Excel khong hop le tai vi tri ${index + 2}`);
      }
      return { username, email };
    });
}

function parseImportFile(file) {
  const fileName = (file.originalname || "").toLowerCase();

  if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
    return parseExcelUsers(file.buffer);
  }

  const content = file.buffer.toString("utf8");
  return parseCsvUsers(content);
}

function generatePassword(length = 16) {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let password = "";
  let randomBytes = crypto.randomBytes(length);

  for (let i = 0; i < length; i++) {
    password += characters[randomBytes[i] % characters.length];
  }

  return password;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendPasswordMailWithRetry(email, username, password, maxRetries = 2) {
  let lastError = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await sendPasswordMail(email, username, password);
      return true;
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        await sleep(1200 * (attempt + 1));
      }
    }
  }
  throw lastError;
}


router.get("/", checkLogin,checkRole("ADMIN","MODERATOR"), async function (req, res, next) {
  let users = await userModel
    .find({ isDeleted: false })
  res.send(users);
});

router.get("/:id", async function (req, res, next) {
  try {
    let result = await userModel
      .find({ _id: req.params.id, isDeleted: false })
    if (result.length > 0) {
      res.send(result);
    }
    else {
      res.status(404).send({ message: "id not found" });
    }
  } catch (error) {
    res.status(404).send({ message: "id not found" });
  }
});

router.post("/", CreateUserValidator, validatedResult, async function (req, res, next) {
  try {
    let newUser = await userController.CreateAnUser(
      req.body.username, req.body.password, req.body.email,
      req.body.role, req.body.fullname, req.body.avatarUrl
    )
    res.send(newUser);
  } catch (err) {
    res.status(400).send({ message: err.message });
  }
});

router.post("/import", checkLogin, checkRole("ADMIN", "MODERATOR"), uploadImport.single("file"), async function (req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).send({ message: "Vui long upload file CSV hoac Excel" });
    }

    let usersFromFile = parseImportFile(req.file);
    if (usersFromFile.length === 0) {
      return res.status(400).send({ message: "File khong co du lieu" });
    }

    let userRole = await roleModel.findOne({ name: { $regex: /^user$/i }, isDeleted: false });
    if (!userRole) {
      return res.status(400).send({ message: "Khong tim thay role USER" });
    }

    let created = [];
    let skipped = [];
    let mailFailed = [];
    for (let item of usersFromFile) {
      let existedByUsername = await userController.FindUserByUsername(item.username);
      let existedByEmail = await userController.FindUserByEmail(item.email);
      if (existedByUsername || existedByEmail) {
        skipped.push({
          username: item.username,
          email: item.email,
          reason: "username hoac email da ton tai"
        });
        continue;
      }

      let rawPassword = generatePassword(16);
      let newUser = await userController.CreateAnUser(
        item.username,
        rawPassword,
        item.email,
        userRole._id,
        undefined,
        undefined,
        true,
        0
      );

      try {
        await sendPasswordMailWithRetry(item.email, item.username, rawPassword);
      } catch (mailError) {
        mailFailed.push({
          username: item.username,
          email: item.email,
          reason: mailError.message
        });
      }

      // Avoid hitting Mailtrap rate limits on free plans.
      await sleep(600);
      created.push({
        id: newUser._id,
        username: newUser.username,
        email: newUser.email
      });
    }

    res.send({
      total: usersFromFile.length,
      created: created.length,
      skipped: skipped.length,
      mailFailed: mailFailed.length,
      createdUsers: created,
      skippedUsers: skipped,
      mailFailedUsers: mailFailed
    });
  } catch (err) {
    res.status(400).send({ message: err.message });
  }
});

router.put("/:id", ModifyUserValidator, validatedResult, async function (req, res, next) {
  try {
    let id = req.params.id;
    let updatedItem = await userModel.findByIdAndUpdate(id, req.body, { new: true });

    if (!updatedItem) return res.status(404).send({ message: "id not found" });

    let populated = await userModel
      .findById(updatedItem._id)
    res.send(populated);
  } catch (err) {
    res.status(400).send({ message: err.message });
  }
});

router.delete("/:id", async function (req, res, next) {
  try {
    let id = req.params.id;
    let updatedItem = await userModel.findByIdAndUpdate(
      id,
      { isDeleted: true },
      { new: true }
    );
    if (!updatedItem) {
      return res.status(404).send({ message: "id not found" });
    }
    res.send(updatedItem);
  } catch (err) {
    res.status(400).send({ message: err.message });
  }
});

module.exports = router;