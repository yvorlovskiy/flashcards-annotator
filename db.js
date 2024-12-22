// Database management module
window.FlashcardDB = class FlashcardDB {
    constructor() {
        this.DB_NAME = 'flashcardDB';
        this.DB_VERSION = 1;
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Store 1: Webpages
                const pagesStore = db.createObjectStore('pages', { keyPath: 'url' });
                pagesStore.createIndex('lastVisited', 'lastVisited');

                // Store 2: Highlights
                const highlightsStore = db.createObjectStore('highlights', { keyPath: 'id', autoIncrement: true });
                highlightsStore.createIndex('pageUrl', 'pageUrl');
                highlightsStore.createIndex('timestamp', 'timestamp');

                // Store 3: Flashcards
                const flashcardsStore = db.createObjectStore('flashcards', { keyPath: 'id', autoIncrement: true });
                flashcardsStore.createIndex('highlightId', 'highlightId');
                flashcardsStore.createIndex('pageUrl', 'pageUrl');
            };
        });
    }

    async addPage(url, content) {
        const page = {
            url,
            contentHash: this.hashContent(content), // For change detection
            lastVisited: new Date().toISOString()
        };

        return this.addToStore('pages', page);
    }

    async addHighlight(pageUrl, selection) {
        const highlight = {
            pageUrl,
            text: selection.text,
            // Store multiple ways to locate the highlight
            locators: {
                xpath: this.getXPath(selection.range.startContainer),
                textContent: selection.text,
                offset: {
                    start: selection.range.startOffset,
                    end: selection.range.endOffset
                },
                // Add surrounding context for better matching
                context: {
                    before: this.getContextBefore(selection.range, 50),
                    after: this.getContextAfter(selection.range, 50)
                }
            },
            timestamp: new Date().toISOString()
        };

        return this.addToStore('highlights', highlight);
    }

    async addFlashcard(highlightId, pageUrl, data) {
        const flashcard = {
            highlightId,
            pageUrl,
            question: data.question,
            answer: data.answer,
            timestamp: new Date().toISOString()
        };

        return this.addToStore('flashcards', flashcard);
    }

    // Helper methods for robust highlight location
    getXPath(element) {
        return ''; // Minimal implementation for now
    }

    getContextBefore(range, chars) {
        return ''; // Minimal implementation for now
    }

    getContextAfter(range, chars) {
        return ''; // Minimal implementation for now
    }

    hashContent(content) {
        return Date.now().toString(); // Simple timestamp as hash for now
    }

    // Transaction wrapper
    async addToStore(storeName, data) {
        return new Promise((resolve, reject) => {
            console.log(`Attempting to add to store ${storeName}:`, data);
            const transaction = this.db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(data);

            request.onsuccess = () => {
                console.log(`Successfully added to ${storeName}:`, request.result);
                resolve(request.result);
            };
            request.onerror = () => {
                console.error(`Error adding to ${storeName}:`, request.error);
                reject(request.error);
            };
            
            // Add transaction error handling
            transaction.onerror = () => {
                console.error(`Transaction error for ${storeName}:`, transaction.error);
            };
        });
    }

    // Query methods
    async getHighlightsForPage(url) {
        return this.queryStore('highlights', 'pageUrl', url);
    }

    async getFlashcardsForHighlight(highlightId) {
        return this.queryStore('flashcards', 'highlightId', highlightId);
    }

    async queryStore(storeName, indexName, value) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Database not initialized'));
                return;
            }

            try {
                const transaction = this.db.transaction(storeName, 'readonly');
                const store = transaction.objectStore(storeName);
                const index = store.index(indexName);
                const request = index.getAll(value);

                request.onsuccess = () => {
                    console.log(`Retrieved from ${storeName}:`, request.result);
                    resolve(request.result || []);
                };
                request.onerror = () => {
                    console.error(`Error querying ${storeName}:`, request.error);
                    reject(request.error);
                };
            } catch (error) {
                console.error(`Error in queryStore ${storeName}:`, error);
                reject(error);
            }
        });
    }

    async deleteHighlight(highlightId) {
        const transaction = this.db.transaction(['highlights', 'flashcards'], 'readwrite');
        const highlightStore = transaction.objectStore('highlights');
        const flashcardStore = transaction.objectStore('flashcards');

        return new Promise((resolve, reject) => {
            try {
                // Delete the highlight
                const highlightRequest = highlightStore.delete(highlightId);
                
                // Delete associated flashcards
                const flashcardIndex = flashcardStore.index('highlightId');
                const flashcardRequest = flashcardIndex.getAll(highlightId);
                
                flashcardRequest.onsuccess = () => {
                    const flashcards = flashcardRequest.result;
                    flashcards.forEach(flashcard => {
                        flashcardStore.delete(flashcard.id);
                    });
                    resolve();
                };
                
                transaction.onerror = () => reject(transaction.error);
            } catch (error) {
                reject(error);
            }
        });
    }
} 