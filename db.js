// Database management module
window.FlashcardDB = class FlashcardDB {
    constructor() {
        this.DB_NAME = 'flashcardDB';
        this.DB_VERSION = 1;
        this.db = null;
        this.context = chrome.runtime?.getURL?.('') ? 'popup' : 'content';
        console.log('FlashcardDB initialized in context:', this.context);
    }

    async init() {
        return new Promise((resolve, reject) => {
            console.log('Initializing database in context:', this.context);
            // Use a consistent database name across contexts
            const dbName = this.context === 'popup' ? 'flashcardDB_popup' : 'flashcardDB';
            const request = indexedDB.open(dbName, this.DB_VERSION);

            request.onerror = () => {
                console.error('Database error:', request.error);
                reject(request.error);
            };

            request.onsuccess = async () => {
                this.db = request.result;
                console.log('Database opened successfully in context:', this.context);
                
                if (this.context === 'popup') {
                    // In popup context, we need to sync with the content database
                    await this.syncWithContentDatabase();
                }
                resolve();
            };

            request.onupgradeneeded = (event) => {
                console.log('Upgrading database in context:', this.context);
                const db = event.target.result;

                if (!db.objectStoreNames.contains('pages')) {
                    const pagesStore = db.createObjectStore('pages', { keyPath: 'url' });
                    pagesStore.createIndex('lastVisited', 'lastVisited');
                }

                if (!db.objectStoreNames.contains('highlights')) {
                    const highlightsStore = db.createObjectStore('highlights', { keyPath: 'id', autoIncrement: true });
                    highlightsStore.createIndex('pageUrl', 'pageUrl');
                    highlightsStore.createIndex('timestamp', 'timestamp');
                }

                if (!db.objectStoreNames.contains('flashcards')) {
                    const flashcardsStore = db.createObjectStore('flashcards', { keyPath: 'id', autoIncrement: true });
                    flashcardsStore.createIndex('highlightId', 'highlightId');
                    flashcardsStore.createIndex('pageUrl', 'pageUrl');
                }
            };
        });
    }

    async syncWithContentDatabase() {
        console.log('Syncing popup database with content database...');
        try {
            const data = await new Promise((resolve, reject) => {
                const timeoutId = setTimeout(() => {
                    reject(new Error('Timeout waiting for database contents'));
                }, 5000);

                chrome.runtime.sendMessage({ action: 'getDatabaseContents' }, (response) => {
                    clearTimeout(timeoutId);
                    
                    if (chrome.runtime.lastError) {
                        console.error('Chrome runtime error:', chrome.runtime.lastError);
                        reject(chrome.runtime.lastError);
                        return;
                    }

                    if (response && response.error) {
                        console.error('Error from background:', response.error);
                        reject(new Error(response.error));
                        return;
                    }

                    console.log('Received database contents:', response);
                    resolve(response);
                });
            });

            if (!data) {
                throw new Error('No data received from content script');
            }

            await this.importData(data);
            console.log('Database sync completed successfully');
        } catch (error) {
            console.error('Error in syncWithContentDatabase:', error);
            throw error;
        }
    }

    async importData(data) {
        if (!data || !data.flashcards || !data.highlights) {
            console.error('Invalid data format received:', data);
            return;
        }

        console.log('Importing data into popup database:', data);
        const { flashcards, highlights } = data;

        try {
            // Import flashcards
            const flashcardsStore = this.db.transaction('flashcards', 'readwrite').objectStore('flashcards');
            for (const flashcard of flashcards) {
                await new Promise((resolve, reject) => {
                    const request = flashcardsStore.put(flashcard);
                    request.onsuccess = () => resolve();
                    request.onerror = () => reject(request.error);
                });
            }

            // Import highlights
            const highlightsStore = this.db.transaction('highlights', 'readwrite').objectStore('highlights');
            for (const highlight of highlights) {
                await new Promise((resolve, reject) => {
                    const request = highlightsStore.put(highlight);
                    request.onsuccess = () => resolve();
                    request.onerror = () => reject(request.error);
                });
            }

            console.log('Data import completed successfully');
        } catch (error) {
            console.error('Error during data import:', error);
            throw error;
        }
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