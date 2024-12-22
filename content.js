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
                    return db.addFlashcard(highlightId, window.location.href, {
                        question,
                        answer
                    });
                })
                .then(() => {
                    popup.remove();
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