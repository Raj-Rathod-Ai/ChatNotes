// Chat Notes Application Logic
const chatEl = document.getElementById('chat');
const fileInput = document.getElementById('fileInput');
const fileList = document.getElementById('fileList');
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
            statusDot.className = 'status-dot-pulse error';
            statusBox.className = 'status-pill status-error-pill';
            statusBox.textContent = 'API key missing';
            
            updateComposerState(false, false);
        } else if (!d.index_ready) {
            statusDot.className = 'status-dot-pulse warning';
            statusBox.className = 'status-pill status-loading';
            statusBox.textContent = 'Awaiting document';
            
            updateComposerState(false, true);
        } else {
            statusDot.className = 'status-dot-pulse success';
            statusBox.className = 'status-pill status-ready';
            statusBox.textContent = 'System Ready';
            
            updateComposerState(true, true);
        }

        // Render current files list dynamically
        fileList.innerHTML = '';
        if (d.current_files && d.current_files.length > 0) {
            d.current_files.forEach(filename => {
                const iconName = getFileIconName(filename);
                const fileCard = document.createElement('div');
                fileCard.className = 'current-file-card';
                fileCard.innerHTML = `
                    <div class="file-icon-wrapper">
                        <i data-lucide="${iconName}"></i>
                    </div>
                    <div class="file-details">
                        <p class="file-name truncate" title="${escapeHtml(filename)}">${escapeHtml(filename)}</p>
                        <p class="file-status-sub">Ready to query</p>
                    </div>
                    <button class="file-delete-btn" onclick="removeDocument('${escapeHtml(filename)}')" title="Delete document">
                        <i data-lucide="x" style="width: 14px; height: 14px;"></i>
                    </button>
                `;
                fileList.appendChild(fileCard);
            });
            
            // Update active header document title info
            const docCount = d.current_files.length;
            activeDocTitle.textContent = `${docCount} Document${docCount > 1 ? 's' : ''} Loaded`;
            document.querySelector('.workspace-header p').textContent = d.current_files.join(', ');
        } else {
            fileList.innerHTML = `
                <div class="file-list-empty">
                    No documents loaded
                </div>
            `;
            activeDocTitle.textContent = 'No Active Document';
            document.querySelector('.workspace-header p').textContent = 'Upload files on the left to start querying';
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
        questionInput.placeholder = "Configure GROQ_API_KEY or MISTRAL_API_KEY in .env to start...";
        sendBtn.disabled = true;
        sendBtn.title = "LLM API credentials are not set";
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
function getFileIconName(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    if (ext === 'pdf') return 'file-text';
    if (ext === 'md') return 'file-code';
    return 'file-signature';
}

// Remove single document trigger
async function removeDocument(filename) {
    if (!confirm(`Are you sure you want to remove "${filename}" from the context index?`)) return;
    
    try {
        const res = await fetch('/api/remove_file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename })
        });
        
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || "Failed to delete file.");
        }
        
        await refreshStatus();
        showToast(`Document "${filename}" removed from context index.`, 'success');
    } catch (err) {
        showToast("Deletion failed: " + err.message, 'error');
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
    const files = Array.from(dt.files);
    if (files.length > 0) {
        handleMultipleFilesUpload(files);
    }
});

fileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
        handleMultipleFilesUpload(files);
    }
});

// Multiple Files Upload Handler
async function handleMultipleFilesUpload(files) {
    const validExtensions = ['pdf', 'txt', 'md'];
    const invalidFiles = files.filter(f => !validExtensions.includes(f.name.split('.').pop().toLowerCase()));
    
    if (invalidFiles.length > 0) {
        showToast("Unsupported format found! Upload only PDF, TXT, or MD.", "error");
        return;
    }

    const tempCards = [];
    // Remove the empty list container placeholder if present
    const emptyMsg = fileList.querySelector('.file-list-empty');
    if (emptyMsg) emptyMsg.remove();

    // Render loading cards for each file
    files.forEach(file => {
        const tempCard = document.createElement('div');
        tempCard.className = 'current-file-card temp-uploading';
        tempCard.style.borderColor = 'rgba(245, 158, 11, 0.3)';
        tempCard.style.background = 'rgba(245, 158, 11, 0.03)';
        tempCard.innerHTML = `
            <div class="file-icon-wrapper">
                <div class="typing-dots" style="padding:0;"><span></span><span></span><span></span></div>
            </div>
            <div class="file-details">
                <p class="file-name truncate">${escapeHtml(file.name)}</p>
                <p class="file-status-sub">Uploading & indexing...</p>
            </div>
        `;
        fileList.appendChild(tempCard);
        tempCards.push(tempCard);
    });
    
    const fd = new FormData();
    files.forEach(file => {
        fd.append('files', file); // 'files' is the parameter name in backend FastAPI upload route
    });
    
    try {
        const res = await fetch('/api/upload', {
            method: 'POST',
            body: fd
        });
        
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || "Server failed to process documents.");
        }
        
        await refreshStatus();
        showToast(`${files.length} document(s) uploaded and indexed successfully!`, "success");
    } catch (err) {
        showToast("Upload & Indexing failed: " + err.message, "error");
        // Remove the temporary loading cards on failure
        tempCards.forEach(card => card.remove());
        await refreshStatus();
    } finally {
        fileInput.value = '';
    }
}

// Clear Chat Action
document.getElementById('clearBtn').addEventListener('click', async () => {
    if (!confirm("Are you sure you want to clear the chat history and delete all uploaded documents?")) return;
    
    try {
        // 1. Clear files and index database on backend
        const res = await fetch('/api/clear', {
            method: 'POST'
        });
        if (!res.ok) {
            throw new Error("Failed to clear backend database index.");
        }
        
        // 2. Wipe UI chat elements and render empty state
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
        
        // 3. Wipes documents view in the sidebar status list
        await refreshStatus();
        showToast("Workspace chat and database reset successfully.", "success");
    } catch (err) {
        showToast("Clear failed: " + err.message, "error");
    }
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
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.detail || "API failed to respond.");
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
                    currentBotMessageHandles.contentDiv.innerHTML = renderMarkdown(fullText) + '<span class="typing-cursor"></span>';
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
        if (currentBotMessageHandles && currentBotMessageHandles.contentDiv) {
            const cursor = currentBotMessageHandles.contentDiv.querySelector('.typing-cursor');
            if (cursor) cursor.remove();
        }
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
