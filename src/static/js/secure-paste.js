// Update the frontend JavaScript to integrate with the backend API

// Client-side encryption using Web Crypto API
async function generateEncryptionKey() {
    return window.crypto.subtle.generateKey(
        {
            name: "AES-GCM",
            length: 256
        },
        true,
        ["encrypt", "decrypt"]
    );
}

async function exportKey(key) {
    const exported = await window.crypto.subtle.exportKey("raw", key);
    return arrayBufferToBase64(exported);
}

async function importKey(keyData) {
    const keyDataBuffer = base64ToArrayBuffer(keyData);
    return window.crypto.subtle.importKey(
        "raw",
        keyDataBuffer,
        {
            name: "AES-GCM",
            length: 256
        },
        false,
        ["encrypt", "decrypt"]
    );
}

async function encryptData(text, key) {
    const encodedText = new TextEncoder().encode(text);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    
    const encryptedData = await window.crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv: iv
        },
        key,
        encodedText
    );
    
    const encryptedArray = new Uint8Array(encryptedData);
    const result = new Uint8Array(iv.length + encryptedArray.length);
    result.set(iv);
    result.set(encryptedArray, iv.length);
    
    return arrayBufferToBase64(result);
}

async function decryptData(encryptedData, key) {
    const dataArray = base64ToArrayBuffer(encryptedData);
    const iv = dataArray.slice(0, 12);
    const data = dataArray.slice(12);
    
    const decryptedData = await window.crypto.subtle.decrypt(
        {
            name: "AES-GCM",
            iv: iv
        },
        key,
        data
    );
    
    return new TextDecoder().decode(decryptedData);
}

function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function base64ToArrayBuffer(base64) {
    const binaryString = atob(
        base64
            .replace(/-/g, '+')
            .replace(/_/g, '/')
            .padEnd(base64.length + (4 - (base64.length % 4 || 4)) % 4, '=')
    );
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

// API Integration
async function createPaste(encryptedContent, expiration, selfDestruct) {
    try {
        const response = await fetch('/api/pastes', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                encrypted_content: encryptedContent,
                expiration: expiration,
                self_destruct: selfDestruct
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error creating paste:', error);
        throw error;
    }
}

async function getPaste(pasteId) {
    try {
        const response = await fetch(`/api/pastes/${pasteId}`);
        
        if (!response.ok) {
            if (response.status === 404) {
                throw new Error('Paste not found or has expired');
            }
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error retrieving paste:', error);
        throw error;
    }
}

// Admin API Integration
async function adminListPastes(page = 1, perPage = 20) {
    try {
        const response = await fetch(`/api/admin/pastes?page=${page}&per_page=${perPage}`);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error listing pastes:', error);
        throw error;
    }
}

async function adminDeletePaste(pasteId) {
    try {
        const response = await fetch(`/api/pastes/${pasteId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error deleting paste:', error);
        throw error;
    }
}

async function adminCleanupExpired() {
    try {
        const response = await fetch('/api/admin/cleanup', {
            method: 'POST'
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error cleaning up expired pastes:', error);
        throw error;
    }
}

// UI Integration
document.addEventListener('DOMContentLoaded', function() {
    const expirationSelect = document.getElementById('expiration-select');
    const customExpiration = document.getElementById('custom-expiration');
    const createButton = document.getElementById('create-button');
    const resultContainer = document.getElementById('result-container');
    const secureLinkInput = document.getElementById('secure-link-input');
    const copyButton = document.getElementById('copy-button');
    
    // Toggle custom expiration fields
    expirationSelect.addEventListener('change', function() {
        if (this.value === 'custom') {
            customExpiration.classList.add('active');
        } else {
            customExpiration.classList.remove('active');
        }
    });
    
    // Create encrypted paste
    createButton.addEventListener('click', async function() {
        const content = document.getElementById('paste-content').value;
        
        if (!content.trim()) {
            alert('Please enter content to encrypt.');
            return;
        }
        
        try {
            // Show loading state
            createButton.disabled = true;
            createButton.textContent = 'Creating...';
            
            // Generate encryption key
            const key = await generateEncryptionKey();
            const keyBase64 = await exportKey(key);
            
            // Encrypt the content
            const encryptedContent = await encryptData(content, key);
            
            // Get expiration settings
            let expiration;
            if (expirationSelect.value === 'custom') {
                const value = document.getElementById('custom-value').value;
                const unit = document.getElementById('custom-unit').value;
                expiration = `custom_${value}_${unit}`;
            } else {
                expiration = expirationSelect.value;
            }
            
            // Get self-destruct setting
            const selfDestruct = document.getElementById('self-destruct-toggle').checked;
            
            // Send to server
            const result = await createPaste(encryptedContent, expiration, selfDestruct);
            
            // Create the secure link with the key in the fragment
            const baseUrl = window.location.origin + window.location.pathname;
            const secureLink = `${baseUrl}?id=${result.id}#key=${keyBase64}`;
            
            // Display the result
            secureLinkInput.value = secureLink;
            resultContainer.classList.add('active');
            
            // Reset form
            document.getElementById('paste-content').value = '';
            
        } catch (error) {
            console.error('Error:', error);
            alert('An error occurred: ' + error.message);
        } finally {
            // Reset button state
            createButton.disabled = false;
            createButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg> Create Encrypted Paste';
        }
    });
    
    // Copy secure link to clipboard
    copyButton.addEventListener('click', function() {
        secureLinkInput.select();
        document.execCommand('copy');
        this.textContent = 'Copied!';
        setTimeout(() => {
            this.textContent = 'Copy';
        }, 2000);
    });
    
    // Check for paste ID in URL
    const urlParams = new URLSearchParams(window.location.search);
    const pasteId = urlParams.get('id');
    
    if (pasteId) {
        // We have a paste ID, try to retrieve the paste
        const hashFragment = window.location.hash.substring(1);
        const keyParam = new URLSearchParams(hashFragment).get('key');
        
        if (keyParam) {
            // We have both paste ID and key, retrieve and decrypt
            retrieveAndDecryptPaste(pasteId, keyParam);
        }
    }
    
    async function retrieveAndDecryptPaste(pasteId, keyBase64) {
        try {
            // Hide the paste form and show loading
            document.querySelector('.paste-container').style.display = 'none';
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'paste-container';
            loadingDiv.innerHTML = '<h2>Loading encrypted content...</h2><p>Retrieving and decrypting your secure paste.</p>';
            document.querySelector('main .container').insertBefore(loadingDiv, resultContainer);
            
            // Import the key
            const key = await importKey(keyBase64);
            
            // Retrieve the paste
            const paste = await getPaste(pasteId);
            
            // Decrypt the content
            const decryptedContent = await decryptData(paste.encrypted_content, key);
            
            // Display the decrypted content
            loadingDiv.innerHTML = `
                <h2>Decrypted Content</h2>
                <div class="security-info" style="margin-bottom: 20px;">
                    <p><strong>Security Notice:</strong></p>
                    <p>This content has been securely decrypted in your browser.</p>
                    ${paste.self_destruct ? '<p><strong>This paste will self-destruct after viewing. It will not be accessible again.</strong></p>' : ''}
                </div>
                <div style="background-color: rgba(20, 28, 40, 0.7); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px; padding: 15px; margin-bottom: 20px;">
                    <pre style="white-space: pre-wrap; word-wrap: break-word; color: #e0e0e0; font-family: 'Consolas', monospace; margin: 0;">${escapeHtml(decryptedContent)}</pre>
                </div>
                <button id="back-button" class="create-button">Back to Secure Paste</button>
            `;
            
            // Add event listener to back button
            document.getElementById('back-button').addEventListener('click', function() {
                window.location.href = window.location.pathname;
            });
            
        } catch (error) {
            console.error('Error:', error);
            
            // Show error message
            document.querySelector('.paste-container').style.display = 'none';
            const errorDiv = document.createElement('div');
            errorDiv.className = 'paste-container';
            errorDiv.innerHTML = `
                <h2>Error</h2>
                <div class="security-info" style="background-color: rgba(244, 67, 54, 0.1); border-left: 4px solid #f44336; margin-bottom: 20px;">
                    <p><strong>Unable to retrieve or decrypt the paste:</strong></p>
                    <p>${escapeHtml(error.message)}</p>
                    <p>The paste may have expired, been deleted, or the link may be incorrect.</p>
                </div>
                <button id="back-button" class="create-button">Back to Secure Paste</button>
            `;
            document.querySelector('main .container').insertBefore(errorDiv, resultContainer);
            
            // Add event listener to back button
            document.getElementById('back-button').addEventListener('click', function() {
                window.location.href = window.location.pathname;
            });
        }
    }
    
    // Helper function to escape HTML
    function escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
});
