// Business logic for flashcard operations
class FlashcardManager {
    constructor(db) {
        this.db = db;
        this.lastSelection = null;
    }

    async saveFlashcard(question, answer) {
        await this.db.addPage(window.location.href, document.body.innerHTML);
        let highlightId = null;

        if (this.lastSelection?.range && this.lastSelection?.text) {
            try {
                highlightId = await this.db.addHighlight(window.location.href, {
                    text: this.lastSelection.text,
                    range: this.lastSelection.range
                });

                // Create highlight span
                const highlightSpan = document.createElement('span');
                highlightSpan.style.backgroundColor = 'yellow';
                highlightSpan.dataset.highlightId = highlightId;
                
                // Handle text nodes properly
                try {
                    // First, try simple highlight
                    this.lastSelection.range.surroundContents(highlightSpan);
                } catch (e) {
                    // If that fails, use a more robust approach
                    const range = this.lastSelection.range;
                    const fragment = range.extractContents();
                    const textContent = fragment.textContent;
                    
                    // Create a new text node with the content
                    highlightSpan.textContent = textContent;
                    
                    // Insert the highlighted span
                    range.insertNode(highlightSpan);
                }
            } catch (error) {
                console.error('Error creating highlight:', error);
                // Continue without highlight if it fails
                // We still want to save the flashcard
            }
        }

        await this.db.addFlashcard(highlightId, window.location.href, { question, answer });
        this.lastSelection = null;
    }

    async deleteFlashcard(highlightSpan) {
        if (highlightSpan.dataset.highlightId) {
            const highlightId = parseInt(highlightSpan.dataset.highlightId);
            await this.db.deleteHighlight(highlightId);
        } else {
            await this.deleteLegacyFlashcard(highlightSpan);
        }
        highlightSpan.outerHTML = highlightSpan.textContent;
    }

    async getFlashcard(highlightSpan) {
        if (highlightSpan.dataset.highlightId) {
            const highlightId = parseInt(highlightSpan.dataset.highlightId);
            const flashcards = await this.db.getFlashcardsForHighlight(highlightId);
            return flashcards[0];
        }
        return this.getLegacyFlashcard(highlightSpan);
    }

    async getLegacyFlashcard(highlightSpan) {
        const result = await new Promise(resolve => 
            chrome.storage.local.get(['flashcards'], resolve)
        );
        return (result.flashcards || []).find(card => 
            card.highlightedText === highlightSpan.textContent &&
            card.url === window.location.href
        );
    }

    async deleteLegacyFlashcard(highlightSpan) {
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

    // ... other methods
} 