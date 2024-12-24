// Business logic for flashcard operations
class FlashcardManager {
    constructor(db) {
        this.db = db;
        this.lastSelection = null;
        this.documentHandler = DocumentHandlerFactory.create();
    }

    async saveFlashcard(question, answer) {
        await this.db.addPage(
            this.documentHandler.getDocumentId(), 
            document.body.innerHTML
        );
        
        let highlightId = null;

        if (this.lastSelection?.range && this.lastSelection?.text) {
            try {
                const highlightData = {
                    text: this.lastSelection.text,
                    range: this.lastSelection.range,
                    documentType: this.documentHandler.type,
                    ...this.lastSelection // Include any additional data (e.g., PDF coordinates)
                };

                highlightId = await this.db.addHighlight(
                    this.documentHandler.getDocumentId(),
                    highlightData
                );

                this.documentHandler.createHighlight(
                    this.lastSelection.range,
                    highlightId
                );
            } catch (error) {
                console.error('Error creating highlight:', error);
            }
        }

        await this.db.addFlashcard(highlightId, this.documentHandler.getDocumentId(), {
            question,
            answer
        });
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