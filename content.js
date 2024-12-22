console.log('CONTENT SCRIPT LOADED - ' + new Date().toISOString());

const db = new FlashcardDB();

// We can't use top-level await in content scripts, so wrap the init in an async function
(async function initializeDB() {
    try {
        await db.init();
    } catch (error) {
        console.error('Failed to initialize database:', error);
    }
})();

let lastSelection = null;

// Store the last selection
document.addEventListener('mouseup', function(e) {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    if (selectedText) {
        lastSelection = {
            text: selectedText,
            range: selection.getRangeAt(0)
        };
    }
});

// Show popup only on Ctrl+O
document.addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.key === 'o') {
        e.preventDefault();
        
        // Remove existing popup if present
        const existingPopup = document.getElementById('flashcard-popup');
        if (existingPopup) {
            existingPopup.remove();
            return;
        }

        // Create popup
        const popup = document.createElement('div');
        popup.id = 'flashcard-popup';
        popup.innerHTML = `
            <div style="padding: 10px;">
                <input type="text" id="question" placeholder="Question" style="margin-bottom: 5px; display: block; width: 200px;">
                <textarea id="answer" placeholder="Answer" style="margin-bottom: 5px; display: block; width: 200px; height: 60px;"></textarea>
                <button id="save-flashcard">Save Flashcard</button>
            </div>
        `;

        // Position popup
        popup.style.position = 'fixed';
        popup.style.left = '50%';
        popup.style.top = '50%';
        popup.style.transform = 'translate(-50%, -50%)';
        popup.style.backgroundColor = 'white';
        popup.style.border = '1px solid #ccc';
        popup.style.borderRadius = '4px';
        popup.style.zIndex = '10000';

        document.body.appendChild(popup);

        // Handle save
        document.getElementById('save-flashcard').onclick = function() {
            const question = document.getElementById('question').value;
            const answer = document.getElementById('answer').value;
            
            if (!question || !answer) {
                alert('Please fill in both question and answer fields');
                return;
            }

            db.addPage(window.location.href, document.body.innerHTML)
                .then(() => {
                    if (lastSelection && lastSelection.range && lastSelection.text) {
                        return db.addHighlight(window.location.href, {
                            text: lastSelection.text,
                            range: lastSelection.range
                        });
                    }
                    return null;
                })
                .then(highlightId => {
                    // Create visual highlight immediately after saving
                    if (lastSelection && lastSelection.range) {
                        const highlightSpan = document.createElement('span');
                        highlightSpan.style.backgroundColor = 'yellow';
                        highlightSpan.dataset.highlightId = highlightId;  // Store the ID for later reference
                        lastSelection.range.surroundContents(highlightSpan);
                    }

                    return db.addFlashcard(highlightId, window.location.href, {
                        question,
                        answer
                    });
                })
                .then(() => {
                    popup.remove();
                    lastSelection = null;  // Clear the selection after successful save
                })
                .catch(error => {
                    console.error('Error saving flashcard:', error);
                    alert('Error saving flashcard. Please try again.');
                });
        };
    }
});

// Restore highlights when page loads
window.addEventListener('load', async function() {
    try {
        // Wait for DB initialization
        if (!db.db) {
            await new Promise(resolve => {
                const checkDb = setInterval(() => {
                    if (db.db) {
                        clearInterval(checkDb);
                        resolve();
                    }
                }, 100);
            });
        }

        // Get highlights for current page from IndexedDB
        const highlights = await db.getHighlightsForPage(window.location.href);
        
        // Simple highlight restoration
        highlights.forEach(highlight => {
            if (!highlight.text) return;
            
            // Find and highlight first instance of the text
            const findAndHighlight = (node) => {
                if (node.nodeType === Node.TEXT_NODE) {
                    const index = node.textContent.indexOf(highlight.text);
                    if (index >= 0) {
                        const range = document.createRange();
                        range.setStart(node, index);
                        range.setEnd(node, index + highlight.text.length);
                        
                        const span = document.createElement('span');
                        span.style.backgroundColor = 'yellow';
                        span.dataset.highlightId = highlight.id;
                        
                        try {
                            range.surroundContents(span);
                            return true; // Text was found and highlighted
                        } catch (e) {
                            console.warn('Could not highlight text:', e);
                        }
                    }
                } else {
                    // Recursively search child nodes
                    for (const child of node.childNodes) {
                        if (findAndHighlight(child)) {
                            return true; // Stop after first highlight
                        }
                    }
                }
                return false;
            };

            findAndHighlight(document.body);
        });

        // Handle legacy highlights
        chrome.storage.local.get(['flashcards'], function(result) {
            const flashcards = result.flashcards || [];
            const pageFlashcards = flashcards.filter(card => 
                card.url === window.location.href && card.highlightedText
            );
            
            pageFlashcards.forEach(flashcard => {
                const findAndHighlight = (node) => {
                    if (node.nodeType === Node.TEXT_NODE) {
                        const index = node.textContent.indexOf(flashcard.highlightedText);
                        if (index >= 0) {
                            const range = document.createRange();
                            range.setStart(node, index);
                            range.setEnd(node, index + flashcard.highlightedText.length);
                            
                            const span = document.createElement('span');
                            span.style.backgroundColor = 'yellow';
                            span.dataset.legacyHighlight = 'true';
                            
                            try {
                                range.surroundContents(span);
                                return true;
                            } catch (e) {
                                console.warn('Could not highlight legacy text:', e);
                            }
                        }
                    } else {
                        for (const child of node.childNodes) {
                            if (findAndHighlight(child)) {
                                return true;
                            }
                        }
                    }
                    return false;
                };

                findAndHighlight(document.body);
            });
        });
    } catch (error) {
        console.error('Error restoring highlights:', error);
    }
});

// Handle clicks on highlights
document.addEventListener('click', async function(e) {
    const highlightSpan = e.target.closest('span[data-highlight-id], span[data-legacy-highlight]');
    if (!highlightSpan) return;

    // Remove existing flashcard popup if it exists
    const existingPopup = document.getElementById('flashcard-view-popup');
    if (existingPopup) {
        existingPopup.remove();
        // If we're clicking the same highlight that created this popup, just exit
        if (existingPopup.dataset.highlightId === highlightSpan.dataset.highlightId) {
            return;
        }
    }

    try {
        let flashcard;
        if (highlightSpan.dataset.highlightId) {
            // Get flashcard from IndexedDB
            const highlightId = parseInt(highlightSpan.dataset.highlightId);
            const flashcards = await db.getFlashcardsForHighlight(highlightId);
            flashcard = flashcards[0];
        } else {
            // Get legacy flashcard from chrome.storage
            const highlightText = highlightSpan.textContent;
            const result = await new Promise(resolve => 
                chrome.storage.local.get(['flashcards'], resolve)
            );
            flashcard = (result.flashcards || []).find(card => 
                card.highlightedText === highlightText &&
                card.url === window.location.href
            );
        }

        if (!flashcard) return;

        // Create and position popup
        const popup = document.createElement('div');
        popup.id = 'flashcard-view-popup';
        popup.dataset.highlightId = highlightSpan.dataset.highlightId;
        popup.innerHTML = `
            <div style="
                padding: 15px;
                background: white;
                border: 1px solid #ccc;
                border-radius: 4px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                max-width: 300px;
                position: relative;
            ">
                <div style="
                    position: absolute;
                    top: 5px;
                    right: 5px;
                    cursor: pointer;
                    padding: 5px;
                ">
                    <span id="delete-highlight" style="
                        color: #666;
                        font-size: 16px;
                    ">🗑️</span>
                </div>
                <div style="font-weight: bold; margin-bottom: 10px;">Q: ${flashcard.question}</div>
                <div>A: ${flashcard.answer}</div>
            </div>
        `;

        // Position popup near the highlight
        const rect = highlightSpan.getBoundingClientRect();
        popup.style.position = 'fixed';
        popup.style.left = `${rect.left}px`;
        popup.style.top = `${rect.bottom + 5}px`;
        popup.style.zIndex = '10000';

        document.body.appendChild(popup);

        // Add delete handler
        const deleteBtn = popup.querySelector('#delete-highlight');
        deleteBtn.onclick = async (e) => {
            e.stopPropagation(); // Prevent event from bubbling
            
            if (confirm('Are you sure you want to delete this flashcard?')) {
                try {
                    if (highlightSpan.dataset.highlightId) {
                        // Delete from IndexedDB
                        const highlightId = parseInt(highlightSpan.dataset.highlightId);
                        await db.deleteHighlight(highlightId);
                    } else {
                        // Delete from legacy storage
                        const result = await new Promise(resolve => 
                            chrome.storage.local.get(['flashcards'], resolve)
                        );
                        const flashcards = result.flashcards || [];
                        const updatedFlashcards = flashcards.filter(card => 
                            !(card.highlightedText === highlightSpan.textContent &&
                            card.url === window.location.href)
                        );
                        await new Promise(resolve => 
                            chrome.storage.local.set({ flashcards: updatedFlashcards }, resolve)
                        );
                    }
                    
                    // Remove the highlight from the page
                    highlightSpan.outerHTML = highlightSpan.textContent;
                    popup.remove();
                } catch (error) {
                    console.error('Error deleting flashcard:', error);
                    alert('Error deleting flashcard. Please try again.');
                }
            }
        };

        // Close popup when clicking outside
        document.addEventListener('click', function closePopup(e) {
            if (!popup.contains(e.target) && e.target !== highlightSpan) {
                popup.remove();
                document.removeEventListener('click', closePopup);
            }
        });
    } catch (error) {
        console.error('Error showing flashcard:', error);
    }
}); 