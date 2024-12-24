// Handle messages from popup to content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getDatabaseContents') {
        // Get the active tab
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs || !tabs.length) {
                sendResponse({ error: 'No active tab found' });
                return;
            }

            // Forward the request to content script
            chrome.tabs.sendMessage(tabs[0].id, { action: 'getDatabaseContents' }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('Error:', chrome.runtime.lastError);
                    sendResponse({ error: chrome.runtime.lastError.message });
                    return;
                }
                console.log('Received response from content script:', response);
                sendResponse(response);
            });
        });

        return true; // Keep the message channel open for async response
    }
}); 