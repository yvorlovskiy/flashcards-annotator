console.log('CONTENT SCRIPT LOADED - ' + new Date().toISOString());

const db = new FlashcardDB();
const flashcardManager = new FlashcardManager(db);

// Initialize
(async function() {
    try {
        await db.init();
        setupEventListeners();
        await restoreAllHighlights();
    } catch (error) {
        console.error('Failed to initialize:', error);
    }
})();

function setupEventListeners() {
    // Selection handler
    document.addEventListener('mouseup', (e) => {
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();
        if (selectedText) {
            flashcardManager.lastSelection = {
                text: selectedText,
                range: selection.getRangeAt(0)
            };
        }
    });

    // Ctrl+O handler
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'o') {
            e.preventDefault();
            handleCreateFlashcard();
        }
    });

    // Click handler for viewing flashcards
    document.addEventListener('click', (e) => {
        const highlightSpan = e.target.closest('span[data-highlight-id], span[data-legacy-highlight]');
        if (highlightSpan) {
            handleViewFlashcard(highlightSpan);
        }
    });
}

// Handler functions for different actions
async function handleCreateFlashcard() {
    const existingPopup = document.getElementById('flashcard-popup');
    if (existingPopup) {
        existingPopup.remove();
        return;
    }

    const popup = FlashcardUI.createInputPopup();
    document.body.appendChild(popup);

    document.getElementById('save-flashcard').onclick = async () => {
        const question = document.getElementById('question').value;
        const answer = document.getElementById('answer').value;
        
        if (!question || !answer) {
            alert('Please fill in both question and answer fields');
            return;
        }

        try {
            await flashcardManager.saveFlashcard(question, answer);
            popup.remove();
        } catch (error) {
            console.error('Error saving flashcard:', error);
            alert('Error saving flashcard. Please try again.');
        }
    };

    // Add click-away functionality
    const handleOutsideClick = function(e) {
        if (!popup.contains(e.target)) {
            popup.remove();
            document.removeEventListener('click', handleOutsideClick);
        }
    };

    // Add click listener with a slight delay to avoid immediate trigger
    setTimeout(() => {
        document.addEventListener('click', handleOutsideClick);
    }, 0);
}

async function handleViewFlashcard(highlightSpan) {
    const existingPopup = document.getElementById('flashcard-view-popup');
    if (existingPopup) {
        existingPopup.remove();
        if (existingPopup.dataset.highlightId === highlightSpan.dataset.highlightId) {
            return;
        }
    }

    try {
        const flashcard = await flashcardManager.getFlashcard(highlightSpan);
        if (!flashcard) return;

        const popup = FlashcardUI.createViewPopup(flashcard, highlightSpan.dataset.highlightId);
        FlashcardUI.positionPopupAtHighlight(popup, highlightSpan);
        document.body.appendChild(popup);

        // Add delete handler
        const deleteBtn = popup.querySelector('#delete-highlight');
        deleteBtn.onclick = async (e) => {
            e.preventDefault(); // Prevent any default button behavior
            e.stopPropagation(); // Prevent event from bubbling
            
            if (confirm('Are you sure you want to delete this flashcard?')) {
                try {
                    await flashcardManager.deleteFlashcard(highlightSpan);
                    popup.remove();
                } catch (error) {
                    console.error('Error deleting flashcard:', error);
                    alert('Error deleting flashcard. Please try again.');
                }
            }
        };

        // Close popup when clicking outside
        const handleOutsideClick = function(e) {
            // Check if click is outside both popup and highlight
            if (!popup.contains(e.target) && !highlightSpan.contains(e.target)) {
                popup.remove();
                document.removeEventListener('click', handleOutsideClick);
            }
        };

        // Add click listener with a slight delay to avoid immediate trigger
        setTimeout(() => {
            document.addEventListener('click', handleOutsideClick);
        }, 0);
    } catch (error) {
        console.error('Error showing flashcard:', error);
    }
}

// Update the text search part in handleViewFlashcard
function findTextNodesWithContent(node, searchText) {
    const textNodes = [];
    const walk = document.createTreeWalker(
        node,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: function(node) {
                return node.textContent.includes(searchText) ? 
                    NodeFilter.FILTER_ACCEPT : 
                    NodeFilter.FILTER_REJECT;
            }
        }
    );

    let currentNode;
    while (currentNode = walk.nextNode()) {
        textNodes.push(currentNode);
    }
    return textNodes;
}

// Update the restore highlights part
async function restoreHighlight(text, highlightId = null, isLegacy = false) {
    const textNodes = findTextNodesWithContent(document.body, text);
    
    for (const node of textNodes) {
        const nodeText = node.textContent;
        const index = nodeText.indexOf(text);
        if (index >= 0) {
            try {
                const range = document.createRange();
                range.setStart(node, index);
                range.setEnd(node, index + text.length);

                const span = document.createElement('span');
                span.style.backgroundColor = 'yellow';
                
                // Add the appropriate data attribute
                if (isLegacy) {
                    span.dataset.legacyHighlight = 'true';
                } else if (highlightId) {
                    span.dataset.highlightId = highlightId;
                }
                
                try {
                    range.surroundContents(span);
                } catch (e) {
                    // If surroundContents fails, use alternative approach
                    const fragment = range.extractContents();
                    span.textContent = fragment.textContent;
                    range.insertNode(span);
                }
                break; // Only highlight first occurrence
            } catch (e) {
                console.warn('Could not highlight text:', e);
            }
        }
    }
}

// Update restoreAllHighlights to use document handler
async function restoreAllHighlights() {
    try {
        // Get all highlights for current page
        const highlights = await db.getHighlightsForPage(
            flashcardManager.documentHandler.getDocumentId()
        );
        
        // Restore each highlight
        for (const highlight of highlights) {
            if (highlight.text) {
                await flashcardManager.documentHandler.restoreHighlight(
                    highlight.text,
                    highlight.id
                );
            }
        }

        // Also restore legacy highlights
        const result = await new Promise(resolve => 
            chrome.storage.local.get(['flashcards'], resolve)
        );
        const flashcards = result.flashcards || [];
        const pageFlashcards = flashcards.filter(card => 
            card.url === window.location.href && card.highlightedText
        );
        
        for (const flashcard of pageFlashcards) {
            await flashcardManager.documentHandler.restoreHighlight(
                flashcard.highlightedText,
                null,
                true
            );
        }
    } catch (error) {
        console.error('Error restoring highlights:', error);
    }
}

// Add message listener for database sync
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getDatabaseContents') {
        console.log('Received request for database contents');
        
        // Create a Promise to handle the async operations
        const getAllData = async () => {
            try {
                // Get flashcards
                const flashcardsData = await new Promise((resolve, reject) => {
                    const transaction = db.db.transaction('flashcards', 'readonly');
                    const store = transaction.objectStore('flashcards');
                    const request = store.getAll();
                    
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                });

                // Get highlights
                const highlightsData = await new Promise((resolve, reject) => {
                    const transaction = db.db.transaction('highlights', 'readonly');
                    const store = transaction.objectStore('highlights');
                    const request = store.getAll();
                    
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                });

                console.log('Retrieved data:', { flashcards: flashcardsData, highlights: highlightsData });
                return { flashcards: flashcardsData, highlights: highlightsData };
            } catch (error) {
                console.error('Error getting data:', error);
                throw error;
            }
        };

        // Execute the async operation and handle the response
        getAllData()
            .then(data => {
                console.log('Sending response with data:', data);
                sendResponse(data);
            })
            .catch(error => {
                console.error('Error in getAllData:', error);
                sendResponse({ error: error.message });
            });

        return true; // Keep the message channel open for async response
    }
});

// ... rest of the handler functions 