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

    if (message.action === 'exportToMarkdown') {
        console.log('Starting markdown export...');
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

                try {
                    console.log('Received data for markdown export:', response);
                    const { flashcards, highlights } = response;
                    
                    // Get unique domains from flashcards
                    const domains = new Set(flashcards.map(card => {
                        try {
                            return new URL(card.pageUrl).hostname.replace('www.', '');
                        } catch {
                            return 'unknown-site';
                        }
                    }));
                    
                    // Create filename from domains
                    const domainString = Array.from(domains).slice(0, 2).join('-');
                    const timestamp = new Date().toISOString().split('T')[0];
                    const filename = `flashcards-${domainString}-${timestamp}.md`;
                    
                    const markdownContent = generateMarkdown(flashcards, highlights);
                    console.log('Generated markdown content:', markdownContent);

                    // Create a download URL using Blob
                    const blob = new Blob([markdownContent], { type: 'text/markdown' });
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        const dataUrl = e.target.result;
                        chrome.downloads.download({
                            url: dataUrl,
                            filename: filename,
                            saveAs: false // Don't prompt for location
                        }, (downloadId) => {
                            if (chrome.runtime.lastError) {
                                console.error('Download error:', chrome.runtime.lastError);
                                sendResponse({ error: chrome.runtime.lastError.message });
                            } else {
                                console.log('Download initiated with ID:', downloadId);
                                sendResponse({ success: true });
                            }
                        });
                    };
                    reader.onerror = function(error) {
                        console.error('Error reading blob:', error);
                        sendResponse({ error: 'Failed to create download URL' });
                    };
                    reader.readAsDataURL(blob);
                } catch (error) {
                    console.error('Error during markdown export:', error);
                    sendResponse({ error: error.message });
                }
            });
        });

        return true; // Keep the message channel open for async response
    }
}); 

function generateMarkdown(flashcards, highlights) {
    if (!Array.isArray(flashcards) || !Array.isArray(highlights)) {
        console.error('Invalid input:', { flashcards, highlights });
        throw new Error('Invalid input: flashcards and highlights must be arrays');
    }

    const highlightsMap = new Map(highlights.map(h => [h.id, h]));
    const pageFlashcards = new Map(); // Group flashcards by page URL

    // Group flashcards by page URL
    flashcards.forEach(flashcard => {
        if (!pageFlashcards.has(flashcard.pageUrl)) {
            pageFlashcards.set(flashcard.pageUrl, []);
        }
        pageFlashcards.get(flashcard.pageUrl).push(flashcard);
    });

    let markdown = '# Flashcards\n\n';

    // Generate markdown for each page
    for (const [pageUrl, cards] of pageFlashcards) {
        markdown += `## Page: ${pageUrl}\n\n`;

        cards.forEach(card => {
            markdown += '### Card\n\n';
            markdown += `**Question:** ${card.question}\n\n`;
            markdown += `**Answer:** ${card.answer}\n\n`;

            // Add highlight context if available
            if (card.highlightId && highlightsMap.has(card.highlightId)) {
                const highlight = highlightsMap.get(card.highlightId);
                markdown += `**Context:** "${highlight.text}"\n\n`;
            }

            markdown += `**Source:** [Link](${pageUrl})\n\n`;
            markdown += '---\n\n';
        });
    }

    return markdown;
} 