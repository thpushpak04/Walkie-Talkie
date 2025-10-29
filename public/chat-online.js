// Walkie Talkie Client (Socket.IO & Multer)

document.addEventListener("DOMContentLoaded", function () {
  const socket = io();

  // Elementi per l'autenticazione
  const registrationForm = document.getElementById("registrationForm");
  const loginForm = document.getElementById("loginForm");
  const authTabs = document.getElementById("authTabs");
  const authTabsContent = document.getElementById("authTabsContent");
  const regMsg = document.getElementById("regMsg");
  const loginMsg = document.getElementById("loginMsg");
  
  // Elementi per la sezione chat
  const chatSection = document.getElementById("chatSection");
  const currentUsernameDisplay = document.getElementById("currentUsername");
  const chatMessages = document.getElementById("chatMessages");
  const chatForm = document.getElementById("chatForm");
  const messageInput = document.getElementById("messageInput");
  const messageColor = document.getElementById("messageColor");
  const bellButton = document.getElementById("bellButton");
  const onlineUsersList = document.getElementById("onlineUsers");
  const logoutButton = document.getElementById("logoutButton");
  const clearChatButton = document.getElementById("clearChatButton"); 
  const exportChatButton = document.getElementById("exportChatButton"); 
  
  // UI and File Elements
  const darkModeToggle = document.getElementById("darkModeToggle");
  const body = document.body;
  const fileInput = document.getElementById("fileInput");
  const selectedFileName = document.getElementById("selectedFileName");
  
  // Room Elements
  const roomStatus = document.getElementById("roomStatus");
  const roomInput = document.getElementById("roomInput");
  const createRoomButton = document.getElementById("createRoomButton");
  const joinRoomButton = document.getElementById("joinRoomButton");
  const leaveRoomButton = document.getElementById("leaveRoomButton");

  let currentUser = null;
  let currentRoom = 'public'; 
  
  // Helper to generate a simple unique ID
  function generateMessageId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
  }

  // ============================================================
  // INIT / AUTH / UI LOGIC 
  // ============================================================
  
  const isDarkMode = localStorage.getItem('darkMode') === 'true';
  if (isDarkMode) {
      body.classList.add('dark-mode');
      darkModeToggle.innerText = '☀️ Light Mode';
  }

  if (darkModeToggle) {
      darkModeToggle.addEventListener('click', () => {
          body.classList.toggle('dark-mode');
          const isDark = body.classList.contains('dark-mode');
          localStorage.setItem('darkMode', isDark);
          darkModeToggle.innerText = isDark ? '☀️ Light Mode' : '🌙 Dark Mode';
      });
  }

  function handleLoginSuccess(username) {
    currentUser = username;
    currentUsernameDisplay.innerText = username;
    authTabs.classList.add("d-none");
    authTabsContent.classList.add("d-none");
    chatSection.classList.remove("d-none");
    socket.emit("userLogin", { username: currentUser, time: new Date().toISOString() });
    loadChatHistory();
  }

  fetch('/session')
    .then(res => res.json())
    .then(data => {
      if (data.loggedIn) {
        handleLoginSuccess(data.username);
      }
    });
    
  // Load chat history (re-enabled fetch to server)
  function loadChatHistory() {
    fetch('/messages')
      .then(res => res.json())
      .then(data => {
         chatMessages.innerHTML = "";
         if (data.success && data.messages) {
             data.messages
                 .filter(msg => msg.room === currentRoom)
                 .forEach((msg) => {
                     addChatMessage(msg);
                 });
         } else {
             const sysMsgDiv = document.createElement("div");
             sysMsgDiv.className = "chat-message bg-warning text-dark text-center";
             sysMsgDiv.innerHTML = `**System:** Welcome to the chat room.`;
             chatMessages.insertBefore(sysMsgDiv, chatMessages.firstChild);
         }
      })
      .catch(err => {
         console.error("Error loading messages:", err);
         const sysMsgDiv = document.createElement("div");
         sysMsgDiv.className = "chat-message bg-danger text-white text-center";
         sysMsgDiv.innerHTML = `**System Error:** Could not load history.`;
         chatMessages.insertBefore(sysMsgDiv, chatMessages.firstChild);
      });
  }

  // --- REGISTRATION LOGIC ---
  if (registrationForm) {
      registrationForm.addEventListener("submit", function (e) {
          e.preventDefault();
          regMsg.innerHTML = '';
          
          const username = document.getElementById("regUsername").value;
          const password = document.getElementById("regPassword").value;

          fetch('/register', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ username, password })
          })
          .then(res => res.json())
          .then(data => {
              const msgClass = data.success ? 'text-success' : 'text-danger';
              regMsg.innerHTML = `<div class="${msgClass}">${data.message}</div>`;
              if (data.success) {
                const loginTabButton = document.getElementById('login-tab');
                const loginTab = new bootstrap.Tab(loginTabButton);
                loginTab.show();
                document.getElementById("loginUsername").value = username;
                document.getElementById("loginPassword").value = password;
              }
          })
          .catch(error => {
              console.error('Registration failed:', error);
              regMsg.innerHTML = `<div class="text-danger">A network error occurred.</div>`;
          });
      });
  }
  
  // --- LOGIN LOGIC ---
  if (loginForm) {
      loginForm.addEventListener("submit", function (e) {
          e.preventDefault();
          loginMsg.innerHTML = '';
          
          const username = document.getElementById("loginUsername").value;
          const password = document.getElementById("loginPassword").value;
          
          fetch('/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ username, password })
          })
          .then(res => res.json())
          .then(data => {
              if (data.success) {
                  handleLoginSuccess(username);
                  loginMsg.innerHTML = `<div class="text-success">${data.message}</div>`;
              } else {
                  loginMsg.innerHTML = `<div class="text-danger">${data.message}</div>`;
              }
          })
          .catch(error => {
              console.error('Login failed:', error);
              loginMsg.innerHTML = `<div class="text-danger">A network error occurred.</div>`;
          });
      });
  }
  
  // --- LOGOUT LOGIC ---
  if (logoutButton) {
      logoutButton.addEventListener("click", function () {
          fetch('/logout', { method: 'POST' })
              .then(res => res.json())
              .then(data => {
                  if (data.success) {
                      window.location.reload();
                  } else {
                      alert('Logout failed: ' + data.message);
                  }
              });
      });
  }

  // ============================================================
  // ROOM MANAGEMENT UI 
  // ============================================================
  function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }
  
  function updateRoomUI(roomID) {
    currentRoom = roomID || 'public';
    
    if (currentRoom !== 'public') {
      roomStatus.innerText = currentRoom;
      roomStatus.classList.remove('bg-success');
      roomStatus.classList.add('bg-danger');
      roomInput.value = currentRoom;
      leaveRoomButton.classList.remove('d-none');
      createRoomButton.classList.add('d-none');
      joinRoomButton.classList.add('d-none');
      
      document.getElementById('roomTitle').innerText = 'Private Room:';
      exportChatButton.classList.add('d-none'); 
      clearChatButton.classList.add('d-none');
      
      messageInput.removeAttribute("required");

    } else {
      roomStatus.innerText = 'Global Chat';
      roomStatus.classList.remove('bg-danger');
      roomStatus.classList.add('bg-success');
      roomInput.value = '';
      leaveRoomButton.classList.add('d-none');
      createRoomButton.classList.remove('d-none');
      joinRoomButton.classList.remove('d-none');
      
      document.getElementById('roomTitle').innerText = 'Current Chat:';
      exportChatButton.classList.remove('d-none');
      clearChatButton.classList.remove('d-none');
      
      messageInput.setAttribute("required", true);
      selectedFileName.innerText = "";
      fileInput.value = "";
    }
    chatMessages.innerHTML = "";
    loadChatHistory(); 
  }
  
  if (createRoomButton) {
      createRoomButton.addEventListener("click", function() {
          const newRoomID = generateRoomCode();
          socket.emit('joinRoom', newRoomID);
      });
  }
  
  if (joinRoomButton) {
      joinRoomButton.addEventListener("click", function() {
          const roomID = roomInput.value.trim().toUpperCase();
          if (roomID) {
              socket.emit('joinRoom', roomID);
          } else {
              alert("Please enter a room code.");
          }
      });
  }
  
  if (leaveRoomButton) {
      leaveRoomButton.addEventListener("click", function() {
          socket.emit('leaveRoom', currentRoom);
      });
  }
  
  socket.on('systemMessage', (data) => {
    updateRoomUI(data.room);
    const sysMsgDiv = document.createElement("div");
    sysMsgDiv.className = "chat-message bg-info text-white text-center";
    sysMsgDiv.innerHTML = data.message;
    chatMessages.insertBefore(sysMsgDiv, chatMessages.firstChild);
  });


  // ============================================================
  // MESSAGE DELETION LOGIC 
  // ============================================================

  function removeMessageFromDOM(messageId) {
      const msgElement = document.getElementById(`msg-${messageId}`);
      if (msgElement) {
          msgElement.remove();
      }
  }

  window.deleteMessage = function(messageId, room) {
      if (confirm("Are you sure you want to delete this message? (This deletion will affect all users currently viewing this room)")) {
          removeMessageFromDOM(messageId);
          socket.emit('deleteMessage', { messageId, room });
      }
  }

  // Listener for incoming deletion requests (from server)
  socket.on('deleteMessage', (data) => {
      removeMessageFromDOM(data.messageId);
  });

  // ============================================================
  // FORM SUBMISSION (Multer File Upload)
  // ============================================================
  if (chatForm) {
    chatForm.addEventListener("submit", function (e) {
      e.preventDefault();
      
      const message = messageInput.value.trim();
      const file = fileInput.files[0];

      if (!message && !file) return;
      if (!currentUser) return;

      const color = messageColor.value; 
      
      if (file) {
        uploadFile(file, color, currentRoom);
      } else {
        const timeStamp = new Date().toISOString();
        const messageId = generateMessageId();
        const messageData = { username: currentUser, message, color, time: timeStamp, room: currentRoom, messageId };
        
        socket.emit("newMessage", messageData);
        messageInput.value = "";
      }
      
      // Reset file input/display
      fileInput.value = "";
      selectedFileName.innerText = "";
      messageInput.setAttribute("required", true);
    });
  }
  
  // --- MULTER FILE UPLOAD FUNCTION ---
  function uploadFile(file, color, room) {
    const formData = new FormData();
    formData.append("chatFile", file);
    formData.append("color", color);
    formData.append("room", room);
    
    fetch("/upload", {
      method: "POST",
      body: formData,
    })
    .then(res => {
        if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);
        return res.json();
    })
    .then(data => {
      if (data.success) {
        alert("File Upload Successful!");
        messageInput.value = ""; 
      } else {
        alert("File upload failed: " + data.message);
      }
    })
    .catch(err => {
      console.error("Upload error:", err);
      alert(`An error occurred during file upload. Please check server console.`);
    });
  }


  // ============================================================
  // OTHER HANDLERS 
  // ============================================================
  
  if (clearChatButton) {
    clearChatButton.addEventListener("click", function () {
      if (currentRoom === 'public') {
          fetch('/clearMessages', { method: 'POST' })
              .then(res => res.json())
              .then(data => {
                 if (data.success) {
                     chatMessages.innerHTML = "";
                     loadChatHistory(); 
                 } else {
                     alert("Failed to clear chat history on server.");
                 }
              });
      } else {
          chatMessages.innerHTML = "";
      }
    });
  }
  
  function exportChatHistory() {
      const messageDivs = Array.from(chatMessages.children).reverse(); 
      let chatLog = "Walkie Talkie Chat Log\n=================================\n\n";

      messageDivs.forEach(div => {
          if (div.classList.contains('chat-message') && !div.classList.contains('bg-info') && !div.classList.contains('bg-warning')) {
              const usernameElement = div.querySelector('strong');
              const timeElement = div.querySelector('small');
              
              const username = usernameElement ? usernameElement.innerText : 'Unknown';
              const time = timeElement ? timeElement.innerText : 'Unknown Time';

              const tempDiv = div.cloneNode(true);
              tempDiv.querySelector('strong')?.remove();
              tempDiv.querySelector('small')?.remove();
              tempDiv.querySelector('.delete-btn')?.remove(); 

              let messageContent = tempDiv.textContent.trim();
              
              chatLog += `[${time}] ${username}: ${messageContent}\n`;
          }
      });

      const blob = new Blob([chatLog], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      
      a.href = url;
      a.download = `walkie-talkie-chat-export-${new Date().toLocaleDateString()}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url); 
  }

  if (exportChatButton) {
      exportChatButton.addEventListener("click", function() {
          exportChatHistory();
      });
  }

  if (fileInput) {
    fileInput.addEventListener("change", function() {
        if (fileInput.files.length > 0) {
            selectedFileName.innerText = `File selected: ${fileInput.files[0].name}. Ready to upload.`;
            messageInput.value = "";
            messageInput.removeAttribute("required"); 
        } else {
            selectedFileName.innerText = "";
            messageInput.value = "";
            messageInput.setAttribute("required", true);
        }
    });
  }

  // --- BELL BUTTON HANDLER ---
  if (bellButton) {
      bellButton.addEventListener('click', () => {
          socket.emit('bell');
          animateBell(); 
      });
  }

  socket.on('ringBell', () => {
    playBellSound();
    animateBell();
  });

  socket.on('broadcastMessage', (data) => {
     if (data.room === currentRoom) {
        addChatMessage(data);
        playMessageSound();
     }
  });

  socket.on('updateOnlineUsers', (users) => {
    updateOnlineUsers(users);
  });

  function addChatMessage(data) {
    const msgDiv = document.createElement("div");
    msgDiv.id = `msg-${data.messageId}`; 
    msgDiv.className = "chat-message";
    
    if (data.username === currentUser) {
        msgDiv.classList.add('self');
    } else {
        msgDiv.classList.add('other');
    }
    
    let messageContent;
    let roomBadge = data.room && data.room !== 'public' ? `<span class="badge bg-danger me-2">${data.room}</span>` : '';
    
    if (data.file && data.file.path) {
        const fileName = data.file.name || 'File';
        const filePath = data.file.path;
        const fileSizeMB = (data.file.size / 1024 / 1024).toFixed(2);
        
        let icon = '📎';
        if (data.file.mimetype && data.file.mimetype.startsWith('image/')) {
            icon = '🖼️';
        }

        messageContent = `${roomBadge}<span class="fw-bold">${icon} File Shared:</span> <a href="${filePath}" target="_blank" download="${fileName}" style="color:${data.color}; text-decoration: underline;">${fileName} (${fileSizeMB} MB)</a>`;
    } else {
      messageContent = `${roomBadge}${data.message}`;
    }

    let deleteButton = '';
    if (data.username === currentUser) {
        // FIX: Use window.deleteMessage to call the globally exposed function.
        deleteButton = `<button class="delete-btn" onclick="window.deleteMessage('${data.messageId}', '${data.room}')">&times;</button>`;
    }
    
    msgDiv.innerHTML = `<strong style="color:${data.color}">${data.username}</strong>: ${messageContent} 
                         ${deleteButton}
                         <small class="text-muted d-block text-end">${new Date(data.time).toLocaleString()}</small>`;
    
    chatMessages.insertBefore(msgDiv, chatMessages.firstChild);
  }

  function updateOnlineUsers(users) {
    onlineUsersList.innerHTML = "";
    users.forEach((user) => {
      const li = document.createElement("li");
      li.className = "list-group-item";
      li.innerText = `${user.username} (since ${new Date(user.time).toLocaleTimeString()})`;
      onlineUsersList.appendChild(li);
    });
  }

  function playMessageSound() {
      // FIX: Use local sound file
      const audio = new Audio("/sounds/beep-07.wav");
      audio.play().catch(e => console.error("Message sound playback failed:", e));
  }
  
  function playBellSound() { 
      // FIX: Use local sound file
      const audio = new Audio("/sounds/bell-ringing-05.mp3");
      audio.play().catch(e => console.error("Bell sound playback failed:", e));
      
      alert("DING DONG! Someone rang the bell!"); 
      
      const sysMsgDiv = document.createElement("div");
      sysMsgDiv.className = "chat-message bg-danger text-white text-center";
      sysMsgDiv.innerHTML = `🔔 **BELL RUNG!** Please check the chat. 🔔`;
      chatMessages.insertBefore(sysMsgDiv, chatMessages.firstChild);
  }
  
  function animateBell() {
      bellButton.classList.add('bell-active');
      setTimeout(() => {
          bellButton.classList.remove('bell-active');
      }, 3000); 
  }
});