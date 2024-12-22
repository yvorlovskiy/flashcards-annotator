document.addEventListener('DOMContentLoaded', function() {
    chrome.storage.local.get(['flashcards'], function(result) {
        const flashcardsList = document.getElementById('flashcards-list');
        const flashcards = result.flashcards || [];
        
        flashcards.forEach(function(flashcard) {
            const card = document.createElement('div');
            card.className = 'flashcard';
            card.innerHTML = `
                <strong>Q: ${flashcard.question}</strong><br>
                <em>A: ${flashcard.answer}</em><br>
                <small>Highlighted text: "${flashcard.highlightedText}"</small><br>
                <small><a href="${flashcard.url}" target="_blank">Source</a></small>
            `;
            flashcardsList.appendChild(card);
        });
    });
}); 