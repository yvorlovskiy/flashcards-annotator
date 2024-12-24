// Add immediate logging to check if script loads
console.log('Popup script starting to load');

// Check if required classes are available
if (typeof FlashcardDB === 'undefined') {
    console.error('FlashcardDB is not defined! db.js might not be loaded correctly');
}

document.addEventListener('DOMContentLoaded', async function() {
    console.log('DOM Content Loaded');
    
    const loadingElement = document.getElementById('loading');
    const flashcardsListElement = document.getElementById('flashcards-list');
    const noFlashcardsElement = document.getElementById('no-flashcards');
    const exportButton = document.getElementById('export-btn');

    // Add export button handler
    exportButton.addEventListener('click', async () => {
        try {
            exportButton.disabled = true;
            exportButton.textContent = 'Exporting...';
            
            // Send message to background script to handle export
            await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({ action: 'exportToMarkdown' }, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                        return;
                    }
                    if (response.error) {
                        reject(new Error(response.error));
                        return;
                    }
                    resolve(response);
                });
            });
        } catch (error) {
            console.error('Error exporting flashcards:', error);
            alert('Error exporting flashcards. Please try again.');
        } finally {
            exportButton.disabled = false;
            exportButton.textContent = 'Export to Markdown';
        }
    });

    try {
        console.log('Initializing database...');
        const db = new FlashcardDB();
        await db.init();
        console.log('Database initialized successfully');

        // Inspect database structure
        console.log('Database name:', db.DB_NAME);
        console.log('Database version:', db.DB_VERSION);
        console.log('Object stores:', Array.from(db.db.objectStoreNames));

        // List all databases
        const databases = await indexedDB.databases();
        console.log('All IndexedDB databases:', databases);

        // Get all flashcards with detailed error checking
        const transaction = db.db.transaction(['flashcards', 'highlights'], 'readonly');
        console.log('Transaction created');

        const flashcardsStore = transaction.objectStore('flashcards');
        const highlightsStore = transaction.objectStore('highlights');

        // Check store metadata
        console.log('Flashcards store:', {
            name: flashcardsStore.name,
            keyPath: flashcardsStore.keyPath,
            indexNames: Array.from(flashcardsStore.indexNames)
        });

        // Get count of items in stores
        const countRequest = flashcardsStore.count();
        countRequest.onsuccess = () => {
            console.log('Number of flashcards in store:', countRequest.result);
        };

        const highlightCountRequest = highlightsStore.count();
        highlightCountRequest.onsuccess = () => {
            console.log('Number of highlights in store:', highlightCountRequest.result);
        };

        // Get all flashcards
        const request = flashcardsStore.getAll();
        console.log('Requested all flashcards');
        
        request.onerror = function(event) {
            console.error("Database error:", event.target.error);
            loadingElement.textContent = 'Error loading flashcards';
        };
        
        request.onsuccess = function(event) {
            const flashcards = event.target.result;
            console.log('Fetched flashcards:', flashcards);
            
            loadingElement.style.display = 'none';
            
            if (!flashcards || flashcards.length === 0) {
                console.log('No flashcards found');
                noFlashcardsElement.style.display = 'block';
                return;
            }

            console.log(`Found ${flashcards.length} flashcards, starting to display them`);

            // Display flashcards
            flashcards.forEach(function(flashcard, index) {
                console.log(`Processing flashcard ${index + 1}/${flashcards.length}:`, flashcard);
                const card = document.createElement('div');
                card.className = 'flashcard';
                
                const questionDiv = document.createElement('div');
                questionDiv.className = 'question';
                questionDiv.textContent = `Q: ${flashcard.question || 'No question'}`;
                
                const answerDiv = document.createElement('div');
                answerDiv.className = 'answer';
                answerDiv.textContent = `A: ${flashcard.answer || 'No answer'}`;
                
                const metadataDiv = document.createElement('div');
                metadataDiv.className = 'metadata';
                
                // Add source link if available
                if (flashcard.pageUrl) {
                    const sourceLink = document.createElement('a');
                    sourceLink.href = flashcard.pageUrl;
                    sourceLink.target = '_blank';
                    sourceLink.textContent = 'View Source';
                    metadataDiv.appendChild(sourceLink);
                }
                
                // Get highlight text
                if (flashcard.highlightId) {
                    console.log(`Fetching highlight for flashcard ${index + 1}, highlightId:`, flashcard.highlightId);
                    const highlightRequest = highlightsStore.get(flashcard.highlightId);
                    
                    highlightRequest.onsuccess = function(event) {
                        const highlight = event.target.result;
                        console.log(`Got highlight for flashcard ${index + 1}:`, highlight);
                        if (highlight && highlight.text) {
                            const highlightText = document.createElement('div');
                            highlightText.textContent = `Highlighted: "${highlight.text}"`;
                            metadataDiv.insertBefore(highlightText, metadataDiv.firstChild);
                        }
                    };

                    highlightRequest.onerror = function(event) {
                        console.error(`Error fetching highlight for flashcard ${index + 1}:`, event.target.error);
                    };
                }
                
                // Assemble the card
                card.appendChild(questionDiv);
                card.appendChild(answerDiv);
                card.appendChild(metadataDiv);
                
                flashcardsListElement.appendChild(card);
            });
        };

        // Add transaction error handler
        transaction.onerror = function(event) {
            console.error('Transaction error:', event.target.error);
        };

    } catch (error) {
        console.error('Error in popup initialization:', error);
        loadingElement.textContent = 'Error loading flashcards. Please try again.';
    }
}); 