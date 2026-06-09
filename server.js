const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');

const app = express();

// Render automatically dictates the port via process.env.PORT
const PORT = process.env.PORT || 3000;

// Gagamit tayo ng Environment Variable para ligtas ang Token mo
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN; 
if (!TELEGRAM_BOT_TOKEN) {
    console.error("CRITICAL ERROR: TELEGRAM_BOT_TOKEN is not defined!");
}
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });

// Siguraduhing magagawa ang 'uploads' folder sa server automatic kung wala pa
if (!fs.existsSync('./uploads')){
    fs.mkdirSync('./uploads');
}

const storage = multer.diskStorage({
    destination: './uploads/',
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

function getPreviousWeekNumber() {
    const current = new Date();
    const target = new Date(current.valueOf() - 7 * 24 * 60 * 60 * 1000);
    const dayNr = (target.getDay() + 6) % 7;
    target.setDate(target.getDate() - dayNr + 3);
    const firstThursday = target.valueOf();
    target.setMonth(0, 1);
    if (target.getDay() !== 4) {
        target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
    }
    return 1 + Math.ceil((firstThursday - target) / (7 * 24 * 60 * 60 * 1000));
}

// Single handling route strategy fed dynamically by frontend execution loop
app.post('/process-pdf', upload.single('pdfFile'), async (req, res) => {
    const targetChatId = req.body.telegramId;
    const QRValue = req.body.qrValue;
    const file = req.file;

    if (!file || !QRValue) {
        return res.status(400).json({ error: 'Data block transmission error or file missing.' });
    }

    try {
        console.log(`[Received Text Metadata]: ${QRValue}`);
        
        const parts = QRValue.split('&&&');
        let DocumentNumber = "";
        let sixDigit = "";
        
        if (parts[1]) {
            const subParts = parts[1].split('-');
            DocumentNumber = subParts[0]; 
            sixDigit = subParts[1] ? subParts[1] : ""; 
        }

        let documentFrom = "";
        if (QRValue.includes("08068")) {
            documentFrom = "Frederick Malapo";
        } else if (QRValue.includes("14359")) {
            documentFrom = "John Carlo Balute";
        }

        const weekNumber = getPreviousWeekNumber();
        let documentNameToRename = "";

        if (DocumentNumber === "12942303") {
            documentNameToRename = `Week ${weekNumber}, 303-${sixDigit} (${documentFrom})`;
        } else if (DocumentNumber === "12942305") {
            documentNameToRename = `Week ${weekNumber}, 305 (${documentFrom})`;
        } else if (DocumentNumber === "12942309") {
            let weekType = "";
            if (QRValue.includes("midweek")) {
                weekType = "Midweek";
            } else if (QRValue.includes("weekend")) {
                weekType = "Weekend";
            }
            documentNameToRename = `Week ${weekNumber}, 309 ${weekType} (${documentFrom})`;
        } else {
            throw new Error(`None of these are supported, stay tuned for updates of the function. (Found: ${DocumentNumber})`);
        }

        // Clean file name constraints 
        const cleanFileName = documentNameToRename.replace(/[/\\?%*:|"<>]/g, '-') + ".pdf";
        const newFilePath = path.join(path.dirname(file.path), cleanFileName);

        // Rename file on native disk file structure
        fs.renameSync(file.path, newFilePath);

        // Send to targeted Telegram context ID
        await bot.sendDocument(targetChatId, newFilePath, {
            caption: `Successfully automated file: ${cleanFileName}`
        });

        // Clean cache storage track
        if (fs.existsSync(newFilePath)) {
            fs.unlinkSync(newFilePath);
        }

        res.json({ success: true, message: cleanFileName });

    } catch (error) {
        console.error(`Error encountered inside execution thread:`, error.message);
        if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
        }
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Automation Server actively deployed locally at http://localhost:${PORT}`);
});