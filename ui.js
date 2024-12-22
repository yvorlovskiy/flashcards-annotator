// UI Component definitions and styles
class FlashcardUI {
    static createPopupStyles() {
        return {
            container: `
                padding: 20px 15px 15px;
                background: white;
                border: 1px solid #ccc;
                border-radius: 4px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                max-width: 300px;
                position: relative;
            `,
            deleteButton: `
                position: absolute;
                top: 0;
                right: 0;
                cursor: pointer;
                padding: 8px;
                background: none;
                border: none;
                opacity: 0.6;
                transition: opacity 0.2s;
                &:hover {
                    opacity: 1;
                }
            `,
            deleteIcon: `
                width: 14px;
                height: 14px;
                display: block;
            `,
            question: `
                font-weight: bold;
                margin-bottom: 10px;
                padding-right: 24px;
            `,
            answer: ``
        };
    }

    static createInputPopup() {
        const popup = document.createElement('div');
        popup.id = 'flashcard-popup';
        popup.innerHTML = `
            <div style="padding: 10px;">
                <input type="text" id="question" placeholder="Question" 
                    style="margin-bottom: 5px; display: block; width: 200px;">
                <textarea id="answer" placeholder="Answer" 
                    style="margin-bottom: 5px; display: block; width: 200px; height: 60px;"></textarea>
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

        return popup;
    }

    static createViewPopup(flashcard, highlightId) {
        const styles = this.createPopupStyles();
        const popup = document.createElement('div');
        popup.id = 'flashcard-view-popup';
        popup.dataset.highlightId = highlightId;
        
        // Create elements individually to ensure proper ID assignment
        const container = document.createElement('div');
        container.style = styles.container;

        const deleteButton = document.createElement('button');
        deleteButton.id = 'delete-highlight';  // Make sure ID is set
        deleteButton.style = styles.deleteButton;
        deleteButton.innerHTML = `
            <svg style="${styles.deleteIcon}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 6l12 12M6 18L18 6"/>
            </svg>
        `;

        const questionDiv = document.createElement('div');
        questionDiv.style = styles.question;
        questionDiv.textContent = `Q: ${flashcard.question}`;

        const answerDiv = document.createElement('div');
        answerDiv.style = styles.answer;
        answerDiv.textContent = `A: ${flashcard.answer}`;

        // Assemble the popup
        container.appendChild(deleteButton);
        container.appendChild(questionDiv);
        container.appendChild(answerDiv);
        popup.appendChild(container);

        return popup;
    }

    static positionPopupAtHighlight(popup, highlightElement) {
        const rect = highlightElement.getBoundingClientRect();
        popup.style.position = 'fixed';
        popup.style.left = `${rect.left}px`;
        popup.style.top = `${rect.bottom + 5}px`;
        popup.style.zIndex = '10000';
    }
} 