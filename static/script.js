// Chat Notes Application Logic
const chatEl = document.getElementById('chat');
const fileInput = document.getElementById('fileInput');
const fileCard = document.getElementById('fileCard');
const currentFileEl = document.getElementById('currentFile');
const fileStatusSub = document.getElementById('fileStatusSub');
const activeDocTitle = document.getElementById('activeDocTitle');
const statusBox = document.getElementById('statusBox');
const statusDot = document.getElementById('statusDot');
const questionInput = document.getElementById('question');
const sendBtn = document.getElementById('sendBtn');
const typingIndicator = document.getElementById('typingIndicator');
const dropZone = document.getElementById('dropZone');

let indexReady = false;
let currentBotMessageHandles = null;

// Initial Setup
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    refreshStatus();
});

// Refresh System Status from API
async function refreshStatus() {
    try {
        const d = await fetch('/api/status').then(r => r.json());
        indexReady = d.index_ready;

        // Update system status indicator
        statusDot.className = 'status-dot-pulse';
        statusBox.className = 'status-pill';

        if (!d.groq_key_set) {
            statusDot.classList.add('error');
            statusBox.classList.add('status-error-pill');
            statusBox.textContent = 'API key missing';
            
            updateComposerState(false, false);
        } else if (!d.index_ready) {
            statusDot.classList.add('warning');
            statusBox.classList.add('status-loading');
            statusBox.textContent = 'Awaiting document';
            
            updateComposerState(false, true);
        } else {
            statusDot.classList.add('success');
            statusBox.classList.add('status-ready');
            statusBox.textContent = 'System Ready';
            
            updateComposerState(true, true);
        }

        // Update active file displays
        if (d.current_file) {
            currentFileEl.textContent = d.current_file;
            fileStatusSub.textContent = 'Document indexed';
            activeDocTitle.textContent = d.current_file;
            
            // Adjust file card appearance
            fileCard.style.borderColor = 'rgba(16, 185, 129, 0.3)';
            fileCard.style.background = 'rgba(16, 185, 129, 0.03)';
            
            // Update document icon based on extension
            updateFileIcon(d.current_file);
        } else {
            currentFileEl.textContent = 'No document loaded';
            fileStatusSub.textContent = 'Ready to upload';
            activeDocTitle.textContent = 'No Active Document';
            
            fileCard.style.borderColor = '';
            fileCard.style.background = '';
            document.getElementById('fileIcon').setAttribute('data-lucide', 'file-text');
        }
        
        lucide.createIcons();
    } catch (err) {
        console.error("Failed to fetch system status:", err);
        statusDot.className = 'status-dot-pulse error';
        statusBox.className = 'status-pill status-error-pill';
        statusBox.textContent = 'Connection failed';
    }
}

// Enable/Disable composer input and button
function updateComposerState(isReady, hasKey) {
    if (!hasKey) {
        questionInput.disabled = true;
        questionInput.placeholder = "Configure GROQ_API_KEY in .env to start...";
        sendBtn.disabled = true;
        sendBtn.title = "GROQ_API_KEY environment variable is not set";
    } else if (!isReady) {
        questionInput.disabled = true;
        questionInput.placeholder = "Please upload a document to enable chat...";
        sendBtn.disabled = true;
        sendBtn.title = "No document indexed yet";
    } else {
        questionInput.disabled = false;
        questionInput.placeholder = "Ask a question about the loaded notes...";
        sendBtn.disabled = false;
        sendBtn.title = "Send question";
    }
}

// Utility to change icon depending on the file suffix
function updateFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const iconEl = document.getElementById('fileIcon');
    
    if (ext === 'pdf') {
        iconEl.setAttribute('data-lucide', 'file-text');
    } else if (ext === 'md') {
        iconEl.setAttribute('data-lucide', 'file-code');
    } else {
        iconEl.setAttribute('data-lucide', 'file-signature');
    }
}

// Drag & Drop File Upload Actions
['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('drag-over');
    }, false);
});

['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('drag-over');
    }, false);
});

dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
        handleFileUpload(files[0]);
    }
});

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        handleFileUpload(file);
    }
});

// File Upload Handler
async function handleFileUpload(file) {
    const validExtensions = ['pdf', 'txt', 'md'];
    const fileExt = file.name.split('.').pop().toLowerCase();
    
    if (!validExtensions.includes(fileExt)) {
        alert("Unsupported file format! Please upload a PDF, TXT, or MD file.");
        return;
    }

    currentFileEl.textContent = 'Uploading...';
    fileStatusSub.textContent = 'Saving file';
    fileCard.style.borderColor = 'rgba(245, 158, 11, 0.3)';
    fileCard.style.background = 'rgba(245, 158, 11, 0.03)';
    
    const fd = new FormData();
    fd.append('file', file);
    
    try {
        const res = await fetch('/api/upload', {
            method: 'POST',
            body: fd
        });
        
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || "Server failed to process document.");
        }
        
        fileStatusSub.textContent = 'Index completed ✓';
        await refreshStatus();
    } catch (err) {
        alert("Upload & Indexing failed: " + err.message);
        currentFileEl.textContent = 'No document loaded';
        fileStatusSub.textContent = 'Ready to upload';
        fileCard.style.borderColor = '';
        fileCard.style.background = '';
        await refreshStatus();
    } finally {
        fileInput.value = '';
    }
}

// Clear Chat Action
document.getElementById('clearBtn').addEventListener('click', () => {
    chatEl.innerHTML = `
        <div id="emptyState" class="empty-state">
            <div class="empty-icon-glow">
                <i data-lucide="message-square-plus"></i>
            </div>
            <h3>Ask your notes anything</h3>
            <p>Upload a textbook, article, notes, or any PDF/TXT/MD, and this assistant will read it to answer your questions with citations.</p>
            
            <div class="suggested-queries">
                <button class="suggestion-chip" onclick="useQuerySuggestion(this)">Summarize this document in 5 key takeaways.</button>
                <button class="suggestion-chip" onclick="useQuerySuggestion(this)">What are the core concepts or definitions introduced?</button>
                <button class="suggestion-chip" onclick="useQuerySuggestion(this)">Are there any action items or next steps mentioned?</button>
            </div>
        </div>
    `;
    lucide.createIcons();
});

// Markdown Rendering Engine
function escapeHtml(s) {
    return s.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
}

function renderMarkdown(text) {
    if (!text) return "";
    let html = escapeHtml(text);
    
    // 1. Process Code Blocks
    const codeBlocks = [];
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
        codeBlocks.push(`<pre><code class="language-${lang}">${code.trim()}</code></pre>`);
        return `\x00BLOCK${codeBlocks.length - 1}\x00`;
    });
    
    // 2. Process Inline Code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // 3. Process Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    
    // 4. Process Lists and Paragraphs Line-by-Line
    const lines = html.split('\n');
    const outputLines = [];
    let inList = false;
    
    for (const line of lines) {
        const cleanLine = line.trim();
        const listMatch = line.match(/^(\s*)[-*]\s+(.*)/);
        
        if (listMatch) {
            if (!inList) {
                outputLines.push('<ul>');
                inList = true;
            }
            outputLines.push(`<li>${listMatch[2]}</li>`);
        } else {
            if (inList) {
                outputLines.push('</ul>');
                inList = false;
            }
            if (cleanLine.startsWith('\x00BLOCK')) {
                outputLines.push(line);
            } else if (cleanLine !== '') {
                outputLines.push(`<p>${line}</p>`);
            }
        }
    }
    
    if (inList) {
        outputLines.push('</ul>');
    }
    
    let finalHtml = outputLines.join('\n');
    
    // 5. Restore Code Blocks
    finalHtml = finalHtml.replace(/\x00BLOCK(\d+)\x00/g, (_, index) => {
        return codeBlocks[index];
    });
    
    return finalHtml;
}

// Add message to chat list UI
function addMessage(role, text) {
    const emptyState = document.getElementById('emptyState');
    if (emptyState) emptyState.remove();

    const row = document.createElement('div');
    row.className = `message-row ${role}`;

    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (role === 'user') {
        row.innerHTML = `
            <div class="message-content-wrapper">
                <div class="message-meta">You · ${timestamp}</div>
                <div class="message-bubble">${escapeHtml(text)}</div>
            </div>
            <div class="message-avatar">
                <i data-lucide="user"></i>
            </div>
        `;
    } else {
        row.innerHTML = `
            <div class="message-avatar">
                <i data-lucide="sparkles"></i>
            </div>
            <div class="message-content-wrapper">
                <div class="message-meta">Assistant · ${timestamp}</div>
                <div class="message-bubble content"></div>
                <div class="sources-citation-wrapper hidden"></div>
            </div>
        `;
    }

    chatEl.appendChild(row);
    lucide.createIcons();
    chatEl.scrollTop = chatEl.scrollHeight;

    if (role === 'bot') {
        const contentDiv = row.querySelector('.content');
        if (text) contentDiv.innerHTML = renderMarkdown(text);
        return {
            contentDiv: contentDiv,
            sourcesWrapper: row.querySelector('.sources-citation-wrapper')
        };
    }
    return null;
}

// Suggestion Queries Click Helper
function useQuerySuggestion(button) {
    if (!indexReady) return;
    questionInput.value = button.textContent;
    questionInput.focus();
}

// Question Sender
async function sendQuestion() {
    const question = questionInput.value.trim();
    if (!question || !indexReady) return;
    
    // Clear Input
    questionInput.value = '';
    
    // Add User Message
    addMessage('user', question);
    
    // Create bot placeholder message
    currentBotMessageHandles = addMessage('bot', '');
    
    // Show typing status
    typingIndicator.classList.remove('hidden');
    chatEl.scrollTop = chatEl.scrollHeight;
    
    try {
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question })
        });
        
        if (!res.ok) {
            throw new Error("API failed to respond.");
        }
        
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        let fullText = '';
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buf += decoder.decode(value, { stream: true });
            
            const events = buf.split('\n\n');
            buf = events.pop();
            
            for (const evt of events) {
                if (!evt.trim()) continue;
                
                let eventType = 'message';
                let data = '';
                
                for (const line of evt.split('\n')) {
                    if (line.startsWith('event: ')) {
                        eventType = line.slice(7);
                    } else if (line.startsWith('data: ')) {
                        data = line.slice(6);
                    }
                }
                
                if (eventType === 'sources') {
                    const sources = JSON.parse(data);
                    renderSources(sources);
                } else if (eventType === 'error') {
                    throw new Error(JSON.parse(data));
                } else if (eventType !== 'done' && data) {
                    fullText += JSON.parse(data);
                    currentBotMessageHandles.contentDiv.innerHTML = renderMarkdown(fullText);
                    chatEl.scrollTop = chatEl.scrollHeight;
                }
            }
        }
    } catch (err) {
        console.error("Chat failure:", err);
        currentBotMessageHandles.contentDiv.innerHTML = `<span style="color:var(--error); font-weight:600;"><i data-lucide="alert-circle" style="width:14px;height:14px;vertical-align:text-bottom;margin-right:4px;"></i>Error: ${err.message}</span>`;
        lucide.createIcons();
    } finally {
        typingIndicator.classList.add('hidden');
        currentBotMessageHandles = null;
        chatEl.scrollTop = chatEl.scrollHeight;
    }
}

// Render citation sources
function renderSources(sources) {
    if (!sources || sources.length === 0 || !currentBotMessageHandles) return;
    
    const wrapper = currentBotMessageHandles.sourcesWrapper;
    wrapper.classList.remove('hidden');
    
    let itemsHtml = '';
    sources.forEach((s, idx) => {
        itemsHtml += `
            <div class="source-item">
                <b>Source Chunk ${idx + 1} • ${escapeHtml(s.source)}</b>
                <div>${escapeHtml(s.preview)}</div>
            </div>
        `;
    });
    
    wrapper.innerHTML = `
        <details class="sources-citation-details">
            <summary class="sources-summary">
                <i data-lucide="search" style="width:12px;height:12px;"></i>
                <span>Context verified from ${sources.length} document chunks</span>
            </summary>
            <div class="sources-content-box">
                ${itemsHtml}
            </div>
        </details>
    `;
    
    lucide.createIcons();
    chatEl.scrollTop = chatEl.scrollHeight;
}

// Event Listeners for Composer Interaction
sendBtn.addEventListener('click', sendQuestion);
questionInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        sendQuestion();
    }
});
