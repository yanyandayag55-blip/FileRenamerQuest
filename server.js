const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');

const app = express();

const PORT = process.env.PORT || 3000;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN; 
if (!TELEGRAM_BOT_TOKEN) {
    console.error("CRITICAL ERROR: TELEGRAM_BOT_TOKEN is not defined!");
}
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });

if (!fs.existsSync('./uploads')){
    fs.mkdirSync('./uploads');
}

const evangelistsFilePath = path.join(__dirname, 'evangelists.json');

// Helper para basahin ang evangelists.json (Awtomatikong gagawa kung wala pa)
function getEvangelists() {
    if (!fs.existsSync(evangelistsFilePath)) {
        const initialData = [
            { number: "08068", name: "Frederick Malapo" },
            { number: "20050", name: "John Pol Rocas" },
            { number: "04788", name: "Gil Cao" }
        ];
        fs.writeFileSync(evangelistsFilePath, JSON.stringify(initialData, null, 2));
        return initialData;
    }
    try {
        const data = fs.readFileSync(evangelistsFilePath, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return [];
    }
}

// Helper para i-save ang bagong listahan
function saveEvangelists(data) {
    fs.writeFileSync(evangelistsFilePath, JSON.stringify(data, null, 2));
}

const storage = multer.diskStorage({
    destination: './uploads/',
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// === API ENDPOINTS PARA SA EVANGELIST MANAGEMENT (CRUD) ===

// 1. Get all evangelists
app.get('/api/evangelists', (req, res) => {
    res.json(getEvangelists());
});

// 2. Add new evangelist
app.post('/api/evangelists', (req, res) => {
    const { number, name } = req.body;
    if (!number || !name) {
        return res.status(400).json({ error: 'Assigned Number and Name are required.' });
    }
    let evangelists = getEvangelists();
    if (evangelists.some(e => e.number === number)) {
        return res.status(400).json({ error: 'This Assigned Number already exists.' });
    }
    evangelists.push({ number, name });
    saveEvangelists(evangelists);
    res.json({ success: true, evangelists });
});

// 3. Rename / Update evangelist
app.put('/api/evangelists/:number', (req, res) => {
    const targetNumber = req.params.number;
    const { name, newNumber } = req.body;
    let evangelists = getEvangelists();
    const index = evangelists.findIndex(e => e.number === targetNumber);
    
    if (index === -1) {
        return res.status(404).json({ error: 'Evangelist not found.' });
    }
    
    if (name) evangelists[index].name = name;
    if (newNumber) evangelists[index].number = newNumber;
    
    saveEvangelists(evangelists);
    res.json({ success: true, evangelists });
});

// 4. Delete evangelist
app.delete('/api/evangelists/:number', (req, res) => {
    const targetNumber = req.params.number;
    let evangelists = getEvangelists();
    const filtered = evangelists.filter(e => e.number !== targetNumber);
    saveEvangelists(filtered);
    res.json({ success: true, evangelists });
});

// ========================================================

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

function getCurrentWeekNumber() {
    const target = new Date();
    const dayNr = (target.getDay() + 6) % 7;
    target.setDate(target.getDate() - dayNr + 3);
    const firstThursday = target.valueOf();
    target.setMonth(0, 1);
    if (target.getDay() !== 4) {
        target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
    }
    return 1 + Math.ceil((firstThursday - target) / (7 * 24 * 60 * 60 * 1000));
}

app.post('/process-pdf', upload.single('pdfFile'), async (req, res) => {
    const targetChatId = req.body.telegramId;
    const QRValue = req.body.qrValue;
    const processType = req.body.processType || 'last';
    const file = req.file;

    if (!file || !QRValue) {
        return res.status(400).json({ error: 'Data block transmission error or file missing.' });
    }

    try {
        console.log(`[Mode: ${processType.toUpperCase()}] [Received Text Metadata]: ${QRValue}`);
        
        const parts = QRValue.split('&&&');
        let DocumentNumber = "";
        let sixDigit = "";
        
        if (parts[1]) {
            const subParts = parts[1].split('-');
            DocumentNumber = subParts[0]; 
            sixDigit = subParts[1] ? subParts[1] : ""; 
        }

        // Dynamic lookup mula sa evangelists.json sa halip na hardcoded if-else
        const evangelists = getEvangelists();
        let documentFrom = "Unknown Evangelist";
        for (const ev of evangelists) {
            if (QRValue.includes(ev.number)) {
                documentFrom = ev.name;
                break;
            }
        }

        let documentNameToRename = "";

        if (processType === 'current') {
            const currentWeekNumber = getCurrentWeekNumber();
            
            if (DocumentNumber === "12942303") {
                documentNameToRename = `Week ${currentWeekNumber}, Unused 303 (${documentFrom})`; 
            } else if (DocumentNumber === "12942305") {
                documentNameToRename = `Week ${currentWeekNumber}, Unused 305 (${documentFrom})`;
            } else if (DocumentNumber === "12942309") {
                documentNameToRename = `Week ${currentWeekNumber}, Unused 309 (${documentFrom})`; 
            } else {
                throw new Error(`None of these are supported, stay tuned for updates of the function. (Found: ${DocumentNumber})`);
            }
        } else {
            const weekNumber = getPreviousWeekNumber();
            
            if (DocumentNumber === "12942303") 
            {
                documentNameToRename = `Week ${weekNumber}, 303-${sixDigit} (${documentFrom})`;
            } 
            else if (DocumentNumber === "12942305") 
            {
                documentNameToRename = `Week ${weekNumber}, 305 (${documentFrom})`;
            } 
            else if (DocumentNumber === "12942309") 
            {
                let weekType = "";
                if (QRValue.includes("midweek")) 
                {
                    weekType = "Midweek";
                } 
                else if (QRValue.includes("weekend")) 
                {
                    weekType = "Weekend";
                }
                documentNameToRename = `Week ${weekNumber}, 309 ${weekType} (${documentFrom})`;
            } else {
                throw new Error(`None of these are supported, stay tuned for updates of the function. (Found: ${DocumentNumber})`);
            }
        }

        const cleanFileName = documentNameToRename.replace(/[/\\?%*:|"<>]/g, '-') + ".pdf";
        const newFilePath = path.join(path.dirname(file.path), cleanFileName);

        fs.renameSync(file.path, newFilePath);

        await bot.sendDocument(targetChatId, newFilePath, {
            caption: `Successfully automated file: ${cleanFileName}`
        });

        if (fs.existsSync(newFilePath)) {
            fs.unlinkSync(newFilePath);
        }

        res.json({ success: true, message: cleanFileName });

    } catch (error) {
        console.error(`Error encountered inside execution thread:`, error.message);
        if (file && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
        }
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Automation Server actively deployed locally at http://localhost:${PORT}`);
});