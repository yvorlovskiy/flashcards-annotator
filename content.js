document.addEventListener('mouseup', function(e) {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    
    if (selectedText) {
        // Remove existing popup if present
        const existingPopup = document.getElementById('flashcard-popup');
        if (existingPopup) {
            existingPopup.remove();
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

        // Position popup near selection
        const rect = selection.getRangeAt(0).getBoundingClientRect();
        popup.style.position = 'fixed';
        popup.style.left = `${rect.left}px`;
        popup.style.top = `${rect.bottom + 10}px`;
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

            const range = selection.getRangeAt(0);
            const highlightSpan = document.createElement('span');
            highlightSpan.style.backgroundColor = 'yellow';
            range.surroundContents(highlightSpan);
            
            const flashcard = {
                question: question,
                answer: answer,
                highlightedText: selectedText,
                url: window.location.href,
                timestamp: new Date().toISOString()
            };

            chrome.storage.local.get(['flashcards'], function(result) {
                const flashcards = result.flashcards || [];
                flashcards.push(flashcard);
                chrome.storage.local.set({ flashcards: flashcards }, function() {
                    popup.remove();
                });
            });
        };
    }
});

// Restore highlights when page loads
window.addEventListener('load', function() {
    chrome.storage.local.get(['flashcards'], function(result) {
        const flashcards = result.flashcards || [];
        const currentUrl = window.location.href;
        
        const pageFlashcards = flashcards.filter(card => card.url === currentUrl);
        
        pageFlashcards.forEach(flashcard => {
            // Simple text search and highlight
            const text = flashcard.highlightedText;
            const textNodes = [];
            const walker = document.createTreeWalker(
                document.body,
                NodeFilter.SHOW_TEXT,
                null,
                false
            );

            let node;
            while (node = walker.nextNode()) {
                if (node.textContent.includes(text)) {
                    textNodes.push(node);
                }
            }

            textNodes.forEach(textNode => {
                const index = textNode.textContent.indexOf(text);
                if (index >= 0) {
                    const range = document.createRange();
                    range.setStart(textNode, index);
                    range.setEnd(textNode, index + text.length);
                    const span = document.createElement('span');
                    span.style.backgroundColor = 'yellow';
                    range.surroundContents(span);
                }
            });
        });
    });
}); 