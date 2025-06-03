let displayName = '';
let isConnected = false;
let lastTimestamp = 0;
let settings = {
    soundEnabled: true,
    autoScrollEnabled: true,
    timestampsEnabled: true,
    dateFormatUS: false,
    notificationsEnabled: true
};

const firebaseConfig = {
    databaseURL: "https://dbapplescriptim-default-rtdb.firebaseio.com/"
};
let messageListener = null;
let displayedMessageIds = new Set();

function init() {
    loadSettings();
    updateConnectionStatus(false);
    
    const display = document.getElementById('display');
    display.innerHTML = '';
    const welcomeMsg = document.createElement('p');
    welcomeMsg.className = 'status-message';
    welcomeMsg.textContent = '🌟 Welcome to DommyChat! Start chatting...';
    display.appendChild(welcomeMsg);
    
    // Check for saved display name and auto-login if found
    const savedName = localStorage.getItem('dommychat_lastDisplayName');
    if (savedName) {
        document.getElementById('displayNameInput').value = savedName;
        login(); // Auto-login with saved name
    }
}

function login() {
    const nameInput = document.getElementById('displayNameInput');
    const name = nameInput.value.trim();
    
    if (!name) {
        alert('Please enter a display name');
        return;
    }
    
    displayName = name;
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('chat').style.display = 'flex';
    
    connectToChat();
}

function logout() {
    if (confirm('Are you sure you want to exit DommyChat?')) {
        if (messageListener) {
            clearInterval(messageListener);
        }
        
        document.getElementById('chat').style.display = 'none';
        document.getElementById('loginScreen').style.display = 'block';
        document.getElementById('display').innerHTML = '<p class="status-message">🌟 Welcome to DommyChat! Start chatting...</p>';
        document.getElementById('displayNameInput').value = '';
        displayName = '';
        isConnected = false;
        lastTimestamp = 0;
        displayedMessageIds.clear();
        updateConnectionStatus(false);
    }
}

function connectToChat() {
    updateConnectionStatus(false, 'Connecting...');
    
    setTimeout(() => {
        isConnected = true;
        updateConnectionStatus(true);
        
        fetchMessages().then(() => {
            addSystemMessage(`${displayName} joined the chat`);
            startMessageListener();
        });
        
        updateStatusAlert('Connected and ready to chat!');
    }, 1000);
}

function startMessageListener() {
    fetchMessages();
    
    messageListener = setInterval(() => {
        fetchMessages();
    }, 3000);
}

async function fetchMessages() {
    try {
        const response = await fetch(`${firebaseConfig.databaseURL}/messages.json`);
        if (response.ok) {
            const data = await response.json();
            if (data) {
                const messages = Object.entries(data)
                    .map(([id, msg]) => ({ id, ...msg }))
                    .filter(msg => msg.timestamp && typeof msg.timestamp === 'number')
                    .sort((a, b) => a.timestamp - b.timestamp);
                
                const newMessages = messages.filter(msg => 
                    !displayedMessageIds.has(msg.id) && 
                    msg.timestamp > lastTimestamp
                );
                
                newMessages.forEach(msg => {
                    displayMessage(msg);
                    displayedMessageIds.add(msg.id);
                    if (msg.timestamp > lastTimestamp) {
                        lastTimestamp = msg.timestamp;
                    }
                });
            }
        }
    } catch (error) {
        console.error('Error fetching messages:', error);
        updateConnectionStatus(false, 'Connection error');
    }
}

function sendMessage() {
    const messageInput = document.getElementById('write');
    const message = messageInput.value.trim();
    
    if (!message || !isConnected) return;
    
    const messageData = {
        sender: displayName,
        message: message,
        timestamp: Math.floor(Date.now() / 1000)
    };
    

    fetch(`${firebaseConfig.databaseURL}/messages.json`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(messageData)
    }).then(response => {
        if (response.ok) {
            messageInput.value = '';
            playSound('sent');
        } else {
            console.error('Failed to send message');
        }
    }).catch(error => {
        console.error('Error sending message:', error);
    });
}

function displayMessage(messageData) {
    const conversation = document.getElementById('display');
    const isOwnMessage = messageData.sender === displayName;
    const timestamp = settings.timestampsEnabled ? formatTimestamp(messageData.timestamp) : '';
    const timeStr = timestamp ? `<span class="message-timestamp">[${timestamp}]</span> ` : '';
    
    if (messageData.type === 'nudge') {
        const nudgeElement = document.createElement('p');
        nudgeElement.className = 'nudge-message';
        nudgeElement.innerHTML = `${timeStr}${escapeHtml(messageData.sender)} sent a nudge!`;
        conversation.appendChild(nudgeElement);
        
        const chatWindow = document.getElementById('chat');
        chatWindow.classList.add('is-nudged');
        setTimeout(() => chatWindow.classList.remove('is-nudged'), 500);
        
        playSound('nudge');
    } else {
        const messageLine1 = document.createElement('div');
        messageLine1.className = 'message-line';
        messageLine1.innerHTML = `${timeStr}<span class="message-sender">${escapeHtml(messageData.sender)}</span> says:`;
        
        const messageLine2 = document.createElement('div');
        messageLine2.className = 'message-line';
        messageLine2.innerHTML = `<span class="message-content">${escapeHtml(messageData.message)}</span>`;
        
        conversation.appendChild(messageLine1);
        conversation.appendChild(messageLine2);
    }
    
    if (settings.autoScrollEnabled) {
        conversation.scrollTop = conversation.scrollHeight;
    }
    
    if (!isOwnMessage && messageData.type !== 'nudge') {
        playSound('received');
        if (settings.notificationsEnabled && document.hidden) {
            showNotification(messageData.sender, messageData.message);
        }
    }
}

function sendNudge() {
    if (!isConnected) return;
    
    const nudgeData = {
        sender: displayName,
        message: '*** NUDGE ***',
        timestamp: Math.floor(Date.now() / 1000),
        type: 'nudge'
    };
    
    fetch(`${firebaseConfig.databaseURL}/messages.json`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(nudgeData)
    }).then(response => {
        if (response.ok) {
            playSound('nudge');
        }
    });
}

// function clearChat() {
//     if (confirm('Clear all messages from this chat window?')) {
//         document.getElementById('display').innerHTML = '<p class="status-message">🌟 Chat cleared. Continue chatting...</p>';
//     }
// }

function handleKeyPress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

function clearInput() {
    document.getElementById('write').value = '';
}

function formatTimestamp(timestamp) {
    const date = new Date(timestamp * 1000);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    if (settings.dateFormatUS) {
        return `${month}/${day}/${year} ${hours}:${minutes}`;
    } else {
        return `${day}/${month}/${year} ${hours}:${minutes}`;
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function addSystemMessage(message) {
    const conversation = document.getElementById('display');
    const messageElement = document.createElement('p');
    messageElement.className = 'status-message';
    messageElement.textContent = message;
    conversation.appendChild(messageElement);
    
    if (settings.autoScrollEnabled) {
        conversation.scrollTop = conversation.scrollHeight;
    }
}

function updateConnectionStatus(connected, message = '') {
    const statusEl = document.getElementById('connectionStatus');
    
    if (connected) {
        statusEl.className = 'connection-status connected';
        statusEl.textContent = 'Connected';
    } else {
        statusEl.className = 'connection-status disconnected';
        statusEl.textContent = message || 'Disconnected';
    }
}

function updateStatusAlert(message) {
    document.getElementById('statusAlert').textContent = message;
}

function toggleSettings() {
    const panel = document.getElementById('settingsPanel');
    panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
}

function saveSettings() {
    settings = {
        soundEnabled: document.getElementById('soundEnabled').checked,
        autoScrollEnabled: settings.autoScrollEnabled, 
        timestampsEnabled: settings.timestampsEnabled, 
        dateFormatUS: document.getElementById('dateFormatUS').checked,
        notificationsEnabled: settings.notificationsEnabled,
    };

    localStorage.setItem('dommychat_settings', JSON.stringify(settings));
    
    // Save the current display name before refreshing
    if (displayName) {
        localStorage.setItem('dommychat_lastDisplayName', displayName);
    }
    
    // Refresh the page
    location.reload();
}




function changeLanguage() {
    alert('Language change functionality coming soon!');
    toggleSettings(); 
}


function loadSettings() {
    const savedSettings = localStorage.getItem('dommychat_settings');
    if (savedSettings) {
        settings = JSON.parse(savedSettings);
    }
    
    document.getElementById('soundEnabled').checked = settings.soundEnabled;
    document.getElementById('dateFormatUS').checked = settings.dateFormatUS;
}

function toggleNotifications() {
    settings.notificationsEnabled = !settings.notificationsEnabled;
    updateStatusAlert(`Notifications ${settings.notificationsEnabled ? 'enabled' : 'disabled'}`);
}

function playSound(type) {
    if (!settings.soundEnabled) return;
    
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        if (type === 'sent') {
            oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        } else if (type === 'received') {
            oscillator.frequency.setValueAtTime(400, audioContext.currentTime);
        } else if (type === 'nudge') {
            oscillator.frequency.setValueAtTime(200, audioContext.currentTime);
        }
        
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.3);
    } catch (error) {
        console.log('Audio not supported');
    }
}

        function showNotification(sender, message) {
            if (Notification.permission === 'granted') {
                new Notification(`${sender} says:`, {
                    body: message,
                    icon: 'https://images.vectorhq.com/images/previews/4f8/msn-messenger-icon-psd-449180.png'
                });
            } else if (Notification.permission !== 'denied') {
                Notification.requestPermission().then(permission => {
                    if (permission === 'granted') {
                        showNotification(sender, message);
                    }
                });
            }
        }

        function showAbout() {
            alert('dommychat\n\nbuilt by gabby todorov\n\nFeatures:\n• русское порно\n• бургер микроволнов');
        }

        window.addEventListener('load', init);

        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }






