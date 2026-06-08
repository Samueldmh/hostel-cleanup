const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const crypto = require('crypto');

function hashPassword(password) {
  if (!password) return "";
  return crypto.createHash('sha256').update(password).digest('hex');
}

function hashAnswer(answer) {
  if (!answer) return "";
  return crypto.createHash('sha256').update(answer.trim().toLowerCase()).digest('hex');
}
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'data', 'db.json');

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' })); // Allow larger payloads for compressed base64 images
app.use(express.static(path.join(__dirname, 'public')));

// Helper to read database
const { spawnSync } = require('child_process');
const CLOUD_DB_URL = process.env.CLOUD_DB_URL;
const MASTER_KEY = process.env.MASTER_KEY;

if (!CLOUD_DB_URL || !MASTER_KEY) {
  console.log("==================================================");
  console.log(" NOTICE: Cloud DB credentials not set in environment.");
  console.log(" Running in LOCAL-ONLY mode (using local data/db.json).");
  console.log("==================================================");
}

// Helper to read database (Cloud sync with Local fallback)
function readDB() {
  if (!CLOUD_DB_URL || !MASTER_KEY) {
    return readLocalDB();
  }
  try {
    const inlineGetScript = `
const https = require('https');
const options = {
  headers: {
    'X-Master-Key': process.env.TARGET_KEY,
    'X-Bin-Meta': 'false',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  }
};
https.get(process.env.TARGET_URL + '/latest', options, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    if (res.statusCode !== 200) {
      console.error('HTTP Error ' + res.statusCode + ': ' + data);
      process.exit(1);
    }
    console.log(data);
  });
}).on('error', (err) => {
  console.error('Connection Error: ' + err.message);
  process.exit(1);
});
    `;

    const result = spawnSync('node', ['-e', inlineGetScript], {
      env: {
        ...process.env,
        TARGET_URL: CLOUD_DB_URL,
        TARGET_KEY: MASTER_KEY
      }
    });

    if (result.error) {
      throw result.error;
    }

    const output = result.stdout.toString('utf8').trim();
    if (result.status !== 0) {
      const errOutput = result.stderr.toString('utf8').trim();
      throw new Error(errOutput || output || 'Child process returned exit code ' + result.status);
    }

    if (!output || output.includes('"message"') && output.includes('"record not found"')) {
      console.log('Cloud database empty. Seeding from local db.json...');
      const localData = readLocalDB();
      writeDB(localData);
      return localData;
    }
    
    const db = JSON.parse(output);
    // Validate schema
    if (!db || !db.members || !db.tasks) {
      throw new Error('Cloud DB returned invalid schema');
    }
    return db;
  } catch (err) {
    console.error('Error reading from Cloud DB, falling back to local:', err);
    return readLocalDB();
  }
}

function readLocalDB() {
  try {
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading local database file:', err);
    return { members: [], tasks: [], history: [] };
  }
}

// Helper to write database (Cloud sync with Local backup)
function writeDB(data) {
  // 1. Write local backup
  try {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tempPath = DB_PATH + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempPath, DB_PATH);
  } catch (err) {
    console.error('Error writing to local backup database file:', err);
  }

  if (!CLOUD_DB_URL || !MASTER_KEY) {
    return true; // Local write succeeded, cloud sync is bypassed
  }

  // 2. Upload to Cloud DB synchronously using native HTTPS in child process
  try {
    const inlinePutScript = `
const https = require('https');
const fs = require('fs');
const data = fs.readFileSync(process.env.TARGET_PATH, 'utf8');

const url = new URL(process.env.TARGET_URL);
const options = {
  hostname: url.hostname,
  path: url.pathname + url.search,
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'X-Master-Key': process.env.TARGET_KEY,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = https.request(options, (res) => {
  let responseData = '';
  res.on('data', (chunk) => responseData += chunk);
  res.on('end', () => {
    if (res.statusCode !== 200) {
      console.error('HTTP Error ' + res.statusCode + ': ' + responseData);
      process.exit(1);
    }
    process.exit(0);
  });
});

req.on('error', (err) => {
  console.error('Connection Error: ' + err.message);
  process.exit(1);
});

req.write(data);
req.end();
    `;

    const result = spawnSync('node', ['-e', inlinePutScript], {
      env: {
        ...process.env,
        TARGET_URL: CLOUD_DB_URL,
        TARGET_KEY: MASTER_KEY,
        TARGET_PATH: DB_PATH.replace(/\\/g, '/')
      }
    });
    
    if (result.error) {
      throw result.error;
    }
    
    if (result.status !== 0) {
      const errOutput = result.stderr.toString('utf8').trim();
      throw new Error(errOutput || 'Child process returned exit code ' + result.status);
    }
    return true;
  } catch (err) {
    console.error('Error writing to Cloud DB:', err);
    return false;
  }
}

// --- API Endpoints ---

// 1. User Login Validation
app.post('/api/login', (req, res) => {
  const { reg, password } = req.body;
  if (!reg) {
    return res.status(400).json({ success: false, message: 'Registration number is required!' });
  }

  const db = readDB();
  const cleanReg = reg.trim();
  const member = db.members.find(m => m.reg.toLowerCase() === cleanReg.toLowerCase());

  if (!member) {
    return res.status(404).json({ success: false, message: 'Registration number not found in hostel database!' });
  }

  // Two-stage login check
  if (password === undefined) {
    if (!member.password) {
      return res.json({
        success: true,
        requiresSetup: true,
        member: { reg: member.reg, name: member.name }
      });
    } else {
      return res.json({
        success: true,
        requiresPassword: true,
        member: { reg: member.reg, name: member.name }
      });
    }
  }

  // Password verification stage
  if (!member.password) {
    return res.status(400).json({ success: false, message: 'Password is not set up yet for this account!' });
  }

  const hashedInput = hashPassword(password);
  if (member.password !== hashedInput) {
    return res.status(401).json({ success: false, message: 'Incorrect password!' });
  }

  res.json({
    success: true,
    member: {
      reg: member.reg,
      name: member.name,
      gender: member.gender,
      isAdmin: member.isAdmin,
      assignedLocationId: member.assignedLocationId
    }
  });
});

// 1.1 First-time Security Setup
app.post('/api/setup-security', (req, res) => {
  const { reg, password, securityQuestion, securityAnswer } = req.body;
  if (!reg || !password || !securityQuestion || !securityAnswer) {
    return res.status(400).json({ success: false, message: 'Missing required fields for setup!' });
  }

  const db = readDB();
  const memberIndex = db.members.findIndex(m => m.reg.toLowerCase() === reg.trim().toLowerCase());

  if (memberIndex === -1) {
    return res.status(404).json({ success: false, message: 'User not found!' });
  }

  const member = db.members[memberIndex];
  if (member.password) {
    return res.status(400).json({ success: false, message: 'Password has already been set up for this account!' });
  }

  // Save hashed credentials
  db.members[memberIndex].password = hashPassword(password);
  db.members[memberIndex].securityQuestion = securityQuestion.trim();
  db.members[memberIndex].securityAnswer = hashAnswer(securityAnswer);

  if (writeDB(db)) {
    res.json({
      success: true,
      message: 'Security setup completed successfully!',
      member: {
        reg: member.reg,
        name: member.name,
        gender: member.gender,
        isAdmin: member.isAdmin,
        assignedLocationId: member.assignedLocationId
      }
    });
  } else {
    res.status(500).json({ success: false, message: 'Error saving setup details to database!' });
  }
});

// 1.2 Get Security Question for Reset
app.post('/api/get-security-question', (req, res) => {
  const { reg } = req.body;
  if (!reg) {
    return res.status(400).json({ success: false, message: 'Registration number is required!' });
  }

  const db = readDB();
  const member = db.members.find(m => m.reg.toLowerCase() === reg.trim().toLowerCase());

  if (!member) {
    return res.status(404).json({ success: false, message: 'Registration number not found!' });
  }

  if (!member.securityQuestion) {
    return res.status(400).json({ success: false, message: 'No security question set up for this account. Please contact the Admin.' });
  }

  res.json({ success: true, question: member.securityQuestion });
});

// 1.3 Reset Password using Security Question
app.post('/api/reset-password', (req, res) => {
  const { reg, securityAnswer, newPassword } = req.body;
  if (!reg || !securityAnswer || !newPassword) {
    return res.status(400).json({ success: false, message: 'Missing parameters!' });
  }

  const db = readDB();
  const memberIndex = db.members.findIndex(m => m.reg.toLowerCase() === reg.trim().toLowerCase());

  if (memberIndex === -1) {
    return res.status(404).json({ success: false, message: 'User not found!' });
  }

  const member = db.members[memberIndex];
  if (!member.securityAnswer) {
    return res.status(400).json({ success: false, message: 'Security question not set up for this account!' });
  }

  const hashedAnswerInput = hashAnswer(securityAnswer);
  if (member.securityAnswer !== hashedAnswerInput) {
    return res.status(401).json({ success: false, message: 'Incorrect answer to the security question!' });
  }

  // Update password
  db.members[memberIndex].password = hashPassword(newPassword);

  // Log action
  if (!db.history) db.history = [];
  db.history.unshift({
    timestamp: new Date().toLocaleString(),
    message: `${member.name} (${member.reg}) reset their password using their security question.`
  });

  if (writeDB(db)) {
    res.json({
      success: true,
      message: 'Password reset successful!',
      member: {
        reg: member.reg,
        name: member.name,
        gender: member.gender,
        isAdmin: member.isAdmin,
        assignedLocationId: member.assignedLocationId
      }
    });
  } else {
    res.status(500).json({ success: false, message: 'Error saving new password to database!' });
  }
});

// 2. Retrieve Complete Hostel State
app.get('/api/state', (req, res) => {
  const db = readDB();
  res.json({
    success: true,
    tasks: db.tasks,
    members: db.members.map(m => ({
      reg: m.reg,
      name: m.name,
      gender: m.gender,
      isAdmin: m.isAdmin,
      assignedLocationId: m.assignedLocationId
    })),
    history: db.history || [],
    settings: db.settings || { nextCleanupDate: "2026-06-13T07:00:00", bypassTimeRestriction: true }
  });
});

// 3. Core Random Allocation Algorithm with Constraints (FCFS & Passcode Verified)
app.post('/api/allocate', (req, res) => {
  const { reg, passcode } = req.body;
  if (!reg) {
    return res.status(400).json({ success: false, message: 'Registration number is required!' });
  }

  const db = readDB();
  const memberIndex = db.members.findIndex(m => m.reg.toLowerCase() === reg.trim().toLowerCase());

  if (memberIndex === -1) {
    return res.status(404).json({ success: false, message: 'User not found!' });
  }

  const member = db.members[memberIndex];

  if (member.isAdmin) {
    return res.status(400).json({ success: false, message: 'Administrators are exempt from cleanup duties!' });
  }

  if (member.assignedLocationId) {
    const existingTask = db.tasks.find(t => t.id === member.assignedLocationId);
    return res.status(400).json({ 
      success: false, 
      message: `You are already assigned to "${existingTask ? existingTask.name : 'a spot'}"!` 
    });
  }

  // Time-restriction check
  const settings = db.settings || {};
  if (!settings.bypassTimeRestriction) {
    const nextDateStr = settings.nextCleanupDate || "2026-06-13T07:00:00";
    const nextDate = new Date(nextDateStr);
    if (new Date() < nextDate) {
      const formattedDate = nextDate.toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      return res.status(400).json({
        success: false,
        message: `Allocations are locked until the scheduled day: ${formattedDate}!`
      });
    }
  }

  // Passcode verification
  const expectedPasscode = settings.assemblyPasscode || "1234";
  if (!passcode || passcode.trim() !== expectedPasscode.trim()) {
    return res.status(400).json({ success: false, message: 'Invalid assembly passcode! Please get the code from the Admin at the assembly point.' });
  }

  // Filter tasks with available capacity
  let availableTasks = db.tasks.filter(t => t.assignedTo.length < t.capacity);

  // Apply consecutive gutter constraint (no member assigned to gutter 3 times in a row)
  let consecutiveGutter = 0;
  const history = db.history || [];
  for (const log of history) {
    if (log.message && log.message.includes(`(${member.reg})`) && log.message.includes('assigned to')) {
      if (log.message.includes('"The gutter"') || log.message.includes('\\"The gutter\\"') || log.message.includes('the_gutter')) {
        consecutiveGutter++;
      } else {
        break; // streak broken
      }
    }
  }
  if (consecutiveGutter >= 2) {
    availableTasks = availableTasks.filter(t => t.id !== 'the_gutter');
  }

  if (availableTasks.length === 0) {
    return res.status(400).json({ 
      success: false, 
      message: 'No available free cleanup spots left! Please contact the Admin.' 
    });
  }

  // FCFS matching: Select tasks from the lowest available difficulty level
  const minDifficulty = Math.min(...availableTasks.map(t => t.difficulty || 2));
  availableTasks = availableTasks.filter(t => (t.difficulty || 2) === minDifficulty);

  // Perform random selection from the easiest subset
  const randomIndex = Math.floor(Math.random() * availableTasks.length);
  const selectedTask = availableTasks[randomIndex];

  // Update DB state
  const taskIndex = db.tasks.findIndex(t => t.id === selectedTask.id);
  
  db.tasks[taskIndex].assignedTo.push({
    reg: member.reg,
    name: member.name
  });
  
  db.members[memberIndex].assignedLocationId = selectedTask.id;

  // Append audit trail log
  if (!db.history) db.history = [];
  const logEntry = {
    timestamp: new Date().toLocaleString(),
    message: `${member.name} (${member.reg}) was randomly assigned to "${selectedTask.name}"`
  };
  db.history.unshift(logEntry); // Keep latest at top

  // Save changes
  if (writeDB(db)) {
    res.json({
      success: true,
      task: db.tasks[taskIndex],
      log: logEntry.message
    });
  } else {
    res.status(500).json({ success: false, message: 'Internal Server Error saving allocation!' });
  }
});

// 4. Admin-Only Picture Upload
app.post('/api/upload-image', (req, res) => {
  const { adminReg, taskId, image } = req.body;

  if (!adminReg || !taskId || !image) {
    return res.status(400).json({ success: false, message: 'Missing required parameters!' });
  }

  const db = readDB();
  const admin = db.members.find(m => m.reg.toLowerCase() === adminReg.trim().toLowerCase());

  if (!admin || !admin.isAdmin) {
    return res.status(403).json({ success: false, message: 'Access Denied: Only administrators can upload pictures!' });
  }

  const taskIndex = db.tasks.findIndex(t => t.id === taskId);
  if (taskIndex === -1) {
    return res.status(404).json({ success: false, message: 'Location not found!' });
  }

  // Update image
  db.tasks[taskIndex].image = image;

  // Log action
  if (!db.history) db.history = [];
  db.history.unshift({
    timestamp: new Date().toLocaleString(),
    message: `Admin ${admin.name} updated the picture for "${db.tasks[taskIndex].name}"`
  });

  if (writeDB(db)) {
    res.json({ success: true, message: 'Location photo successfully updated!' });
  } else {
    res.status(500).json({ success: false, message: 'Internal Server Error saving image!' });
  }
});

// 5. Admin-Only Weekly Cleanup Reset
app.post('/api/reset', (req, res) => {
  const { adminReg } = req.body;

  if (!adminReg) {
    return res.status(400).json({ success: false, message: 'Missing admin registration number!' });
  }

  const db = readDB();
  const admin = db.members.find(m => m.reg.toLowerCase() === adminReg.trim().toLowerCase());

  if (!admin || !admin.isAdmin) {
    return res.status(403).json({ success: false, message: 'Access Denied: Only administrators can reset allocations!' });
  }

  // Clear allocations
  db.members.forEach(m => {
    m.assignedLocationId = null;
  });

  db.tasks.forEach(t => {
    t.assignedTo = [];
    t.completedBy = [];
  });

  // Roll nextCleanupDate forward by 14 days (2 weeks) only if it has already passed
  if (!db.settings) db.settings = {};
  const currentCleanupStr = db.settings.nextCleanupDate || "2026-06-13T07:00:00";
  let nextDate = new Date(currentCleanupStr);
  if (isNaN(nextDate.getTime())) {
    nextDate = new Date("2026-06-13T07:00:00");
  }

  const now = new Date();
  let rolledForward = false;
  while (nextDate <= now) {
    nextDate.setDate(nextDate.getDate() + 14);
    rolledForward = true;
  }

  // Format as YYYY-MM-DDTHH:MM:SS (local style string)
  const pad = (n) => String(n).padStart(2, '0');
  const nextDateStr = `${nextDate.getFullYear()}-${pad(nextDate.getMonth()+1)}-${pad(nextDate.getDate())}T${pad(nextDate.getHours())}:${pad(nextDate.getMinutes())}:${pad(nextDate.getSeconds())}`;
  db.settings.nextCleanupDate = nextDateStr;

  // Log reset
  if (!db.history) db.history = [];
  let logMsg;
  if (rolledForward) {
    logMsg = `Admin ${admin.name} reset Saturday allocations. Next cleanup rolled forward to ${nextDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}.`;
  } else {
    logMsg = `Admin ${admin.name} reset Saturday allocations (schedule kept at ${nextDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}).`;
  }
  
  db.history.unshift({
    timestamp: new Date().toLocaleString(),
    message: logMsg
  });

  if (writeDB(db)) {
    let msg;
    if (rolledForward) {
      msg = `Allocations reset! Next cleanup rolled forward to ${nextDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.`;
    } else {
      msg = `Allocations reset! Schedule remains set for ${nextDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.`;
    }
    res.json({ 
      success: true, 
      message: msg,
      nextCleanupDate: nextDateStr
    });
  } else {
    res.status(500).json({ success: false, message: 'Internal Server Error resetting data!' });
  }
});

// 6. Complete Assigned Task Checklist (Admin-only Trigger)
app.post('/api/complete-task', (req, res) => {
  const { adminReg, studentReg } = req.body;

  if (!adminReg || !studentReg) {
    return res.status(400).json({ success: false, message: 'Missing parameters adminReg or studentReg!' });
  }

  const db = readDB();
  const admin = db.members.find(m => m.reg.toLowerCase() === adminReg.trim().toLowerCase());
  if (!admin || !admin.isAdmin) {
    return res.status(403).json({ success: false, message: 'Access Denied: Only administrators can mark tasks as completed!' });
  }

  const student = db.members.find(m => m.reg.toLowerCase() === studentReg.trim().toLowerCase());
  if (!student) {
    return res.status(404).json({ success: false, message: 'Student not found in hostel database!' });
  }

  const taskId = student.assignedLocationId;
  if (!taskId) {
    return res.status(400).json({ success: false, message: 'Student has not been assigned to any location!' });
  }

  const taskIndex = db.tasks.findIndex(t => t.id === taskId);
  if (taskIndex === -1) {
    return res.status(404).json({ success: false, message: 'Assigned location not found!' });
  }

  const task = db.tasks[taskIndex];

  if (!task.completedBy) task.completedBy = [];
  
  if (!task.completedBy.includes(student.reg)) {
    task.completedBy.push(student.reg);
    
    // Log action
    if (!db.history) db.history = [];
    db.history.unshift({
      timestamp: new Date().toLocaleString(),
      message: `Admin ${admin.name} marked ${student.name}'s task at "${task.name}" as completed!`
    });
  }

  if (writeDB(db)) {
    res.json({ success: true, message: `Successfully marked ${student.name}'s task as completed!` });
  } else {
    res.status(500).json({ success: false, message: 'Error updating task completion in database!' });
  }
});

// 7. Admin-Only Update Settings
app.post('/api/update-settings', (req, res) => {
  const { adminReg, bypassTimeRestriction, nextCleanupDate, assemblyPasscode } = req.body;

  if (!adminReg) {
    return res.status(400).json({ success: false, message: 'Admin registration number is required!' });
  }

  const db = readDB();
  const admin = db.members.find(m => m.reg.toLowerCase() === adminReg.trim().toLowerCase());

  if (!admin || !admin.isAdmin) {
    return res.status(403).json({ success: false, message: 'Access Denied: Only administrators can update settings!' });
  }

  if (!db.settings) db.settings = {};

  if (bypassTimeRestriction !== undefined) {
    db.settings.bypassTimeRestriction = Boolean(bypassTimeRestriction);
  }

  if (nextCleanupDate) {
    const parsedDate = new Date(nextCleanupDate);
    if (isNaN(parsedDate.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid date format! Use YYYY-MM-DDTHH:MM:SS' });
    }
    db.settings.nextCleanupDate = nextCleanupDate;
  }

  if (assemblyPasscode !== undefined) {
    db.settings.assemblyPasscode = String(assemblyPasscode).trim();
  }

  // Log action
  if (!db.history) db.history = [];
  const logMsg = `Admin ${admin.name} updated settings: next cleanup set to ${db.settings.nextCleanupDate}, bypass=${db.settings.bypassTimeRestriction}, passcode=${db.settings.assemblyPasscode}`;
  db.history.unshift({
    timestamp: new Date().toLocaleString(),
    message: logMsg
  });

  if (writeDB(db)) {
    res.json({
      success: true,
      message: 'Hostel cleanup settings updated successfully!',
      settings: db.settings
    });
  } else {
    res.status(500).json({ success: false, message: 'Internal Server Error saving settings!' });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(` HOSTEL CLEANUP SYSTEM SERVER STARTED SUCCESSFULLY`);
  console.log(` Local Server: http://localhost:${PORT}`);
  console.log(` Database Path: ${DB_PATH}`);
  console.log(`==================================================`);
});
