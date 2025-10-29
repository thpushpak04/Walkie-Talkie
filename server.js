// Walkie Talkie Server (Socket.IO & Multer)

const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Configuration for Multer (File Storage)
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir)
  },
  filename: function (req, file, cb) {
    // Unique filename: fieldname-timestamp-originalname
    cb(null, file.fieldname + '-' + Date.now() + '-' + file.originalname)
  }
});
const upload = multer({ storage: storage });

// Middleware for JSON parsing
app.use(express.json());

/* ========================================
   Middleware for Sessions
   ======================================== */
app.use(session({
  secret: 'your-very-secret-key', // Use a strong secret key in production
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

// Check authentication status for non-public paths
const isAuthenticated = (req, res, next) => {
  if (req.session.user) {
    return next();
  }
  res.status(401).json({ success: false, message: "Unauthorized" });
};

// JSON file paths
const USERS_FILE = path.join(__dirname, 'user-save.json');
const MESSAGES_FILE = path.join(__dirname, 'messages.json'); 

// Helper functions for Persistence
function readJSON(filePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) {
        if (err.code === 'ENOENT' || data === undefined || data === null || data.trim() === '') {
            return resolve([]);
        }
        return reject(err);
      }
      try {
        resolve(JSON.parse(data));
      } catch (parseErr) {
        reject(parseErr);
      }
    });
  });
}

function writeJSON(filePath, data) {
    return new Promise((resolve, reject) => {
        fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8', (err) => {
            if (err) return reject(err);
            resolve();
        });
    });
}

// Save message to JSON file
async function saveMessage(messageData) {
    try {
        let messages = await readJSON(MESSAGES_FILE);
        messages.push(messageData);
        await writeJSON(MESSAGES_FILE, messages);
    } catch (err) {
        console.error("Error saving message:", err);
    }
}

// Serve static files from "public" folder
app.use(express.static(path.join(__dirname, 'public')));


/* ========================================
   API REST (Authentication & File Handling)
   ======================================== */

// Registration (User Persistence)
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!(username && password)) {
    return res.status(400).json({ success: false, message: "Username and password required." });
  }

  try {
    let users = await readJSON(USERS_FILE);
    if (users.find(user => user.username === username)) {
      return res.json({ success: false, message: "Username already exists." });
    }
    const newUser = { username, password, registeredAt: new Date().toISOString() };
    users.push(newUser);
    await writeJSON(USERS_FILE, users); 
    res.json({ success: true, message: "Registration successful. Please log in." });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ success: false, message: "Server error during registration." });
  }
});

// Login
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!(username && password)) {
    return res.status(400).json({ success: false, message: "Username and password required." });
  }

  try {
    let users = await readJSON(USERS_FILE);
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) {
      return res.json({ success: false, message: "Invalid username or password." });
    }
    req.session.user = { username };
    res.json({ success: true, message: "Login successful." });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ success: false, message: "Server error during login." });
  }
});

// Session Check
app.get('/session', (req, res) => {
  if (req.session.user) {
    res.json({ loggedIn: true, username: req.session.user.username });
  } else {
    res.json({ loggedIn: false });
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ success: false, message: "Logout failed." });
    res.json({ success: true, message: "Logout successful." });
  });
});

// GET Messages (History loading)
app.get('/messages', isAuthenticated, async (req, res) => {
    try {
        const messages = await readJSON(MESSAGES_FILE);
        res.json({ success: true, messages });
    } catch (err) {
        console.error("Error reading messages:", err);
        res.status(500).json({ success: false, message: "Could not retrieve messages." });
    }
});

// POST Clear Messages
app.post('/clearMessages', isAuthenticated, async (req, res) => {
    try {
        await writeJSON(MESSAGES_FILE, []);
        res.json({ success: true, message: "Chat history cleared." });
    } catch (err) {
        console.error("Error clearing messages:", err);
        res.status(500).json({ success: false, message: "Failed to clear chat history." });
    }
});

// POST File Upload (Multer)
app.post('/upload', isAuthenticated, upload.single('chatFile'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: "No file uploaded." });
    }

    const { color, room } = req.body;
    const username = req.session.user.username;

    // Construct message data for file sharing
    const messageData = {
        username,
        color,
        time: new Date().toISOString(),
        room: room || 'public',
        messageId: Date.now().toString(36) + Math.random().toString(36).substring(2, 7),
        file: {
            name: req.file.originalname,
            path: `/uploads/${req.file.filename}`, // URL path to access the file
            size: req.file.size,
            mimetype: req.file.mimetype,
        }
    };
    
    // Save to persistence
    await saveMessage(messageData);

    // Broadcast the file message to the room
    io.to(messageData.room).emit('broadcastMessage', messageData);

    res.json({ success: true, message: "File uploaded and broadcasted successfully." });
});


/* ========================================
   Socket.io: Real-time Chat Logic
   ======================================== */

let onlineUsers = []; // Stores user metadata including their room

io.on('connection', (socket) => {
  console.log("Socket connected:", socket.id);

  // Default to public room
  socket.join('public'); 

  // --- ROOM MANAGEMENT ---
  socket.on('joinRoom', (roomID) => {
    // Leave previous room (except socket.id and 'public')
    socket.rooms.forEach(room => {
        if (room !== socket.id && room !== 'public') {
            socket.leave(room);
        }
    });
    socket.join(roomID);
    console.log(`User ${socket.id} joined room: ${roomID}`);
    // Notify the user client to update UI and reload history for the new room
    socket.emit('systemMessage', { message: `You have joined room: ${roomID}.`, room: roomID });
  });

  socket.on('leaveRoom', (roomID) => {
    socket.leave(roomID);
    socket.join('public'); 
    console.log(`User ${socket.id} left room: ${roomID} and rejoined public.`);
    socket.emit('systemMessage', { message: `You left room: ${roomID}. Now in Global Chat.`, room: 'public' });
  });
  // ----------------------------------------

  socket.on('userLogin', (data) => {
    onlineUsers.push({ socketId: socket.id, username: data.username, time: data.time });
    io.emit('updateOnlineUsers', onlineUsers.map(user => ({ username: user.username, time: user.time })));
  });

  socket.on('newMessage', async (data) => {
    const targetRoom = data.room || 'public';
    data.messageId = data.messageId || Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
    
    // Save to persistence (for Global Chat and Private Rooms)
    await saveMessage(data);

    // The server broadcasts the message to everyone in the target room.
    io.to(targetRoom).emit('broadcastMessage', data);
  });
  
  // DELETE MESSAGE HANDLER 
  socket.on('deleteMessage', async (data) => {
      const targetRoom = data.room || 'public';
      
      // 1. Remove from persistence (optional for persistence-based projects)
      try {
          let messages = await readJSON(MESSAGES_FILE);
          messages = messages.filter(msg => msg.messageId !== data.messageId);
          await writeJSON(MESSAGES_FILE, messages);
      } catch (e) {
          console.error("Failed to delete message from file:", e);
      }

      // 2. Broadcast deletion to all clients in the room
      io.to(targetRoom).emit('deleteMessage', { messageId: data.messageId });
  });

  socket.on('bell', () => {
    // Broadcast bell ring to ALL connected users
    io.emit('ringBell');
  });

  socket.on('disconnect', () => {
    onlineUsers = onlineUsers.filter(user => user.socketId !== socket.id);
    io.emit('updateOnlineUsers', onlineUsers.map(user => ({ username: user.username, time: user.time })));
  });
});


/* ========================================
   Server Startup
   ======================================== */
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Walkie Talkie Server is running on port ${PORT}`);
});