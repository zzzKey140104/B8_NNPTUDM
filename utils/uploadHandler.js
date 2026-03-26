let multer = require('multer')
let path = require('path')
let fs = require('fs')

//luu o dau, luu ten la gi? file->req->save->xu ly
const uploadDir = path.join(__dirname, '../uploads')
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true })
}

let storageSetting = multer.diskStorage({//path->filename
    destination: function (req, file, cb) {
        cb(null, uploadDir)
    },
    filename: function (req, file, cb) {
        let ext = path.extname(file.originalname)
        let namefile = Date.now() + "-" + Math.round(Math.random() * 2E9) + ext;
        cb(null, namefile)
    },
})
let filterImage = function (req, file, cb) {
    if (file.mimetype.startsWith('image')) {
        cb(null, true)
    } else {
        cb(new Error("file sai dinh dang"))
    }
}
module.exports = multer({
    storage: storageSetting,
    limits: 5 * 1024 * 1024,//5MB,
    fileFilter: filterImage
})