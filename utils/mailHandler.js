const nodemailer = require("nodemailer");


const transporter = nodemailer.createTransport({
    host: "sandbox.smtp.mailtrap.io",
    port: 25,
    secure: false, // Use true for port 465, false for port 587
    auth: {
        user: process.env.MAILTRAP_USER || "",
        pass: process.env.MAILTRAP_PASS || "",
    },
});
module.exports = {
    sendMail: async function (to,url) {
        const info = await transporter.sendMail({
            from: 'hehehe@gmail.com',
            to: to,
            subject: "reset password URL",
            text: "click vao day de doi pass", // Plain-text version of the message
            html: "click vao <a href="+url+">day</a> de doi pass", // HTML version of the message
        });

        console.log("Message sent:", info.messageId);
    },
    sendPasswordMail: async function (to, username, password) {
        const info = await transporter.sendMail({
            from: "no-reply@nnptud.local",
            to: to,
            subject: "Tai khoan moi cua ban",
            text: `Xin chao ${username}, mat khau tam thoi cua ban la: ${password}`,
            html: `<p>Xin chao <b>${username}</b>,</p><p>Mat khau tam thoi cua ban la: <b>${password}</b></p><p>Vui long doi mat khau sau khi dang nhap.</p>`,
        });

        console.log("Password mail sent:", info.messageId);
    }
}
