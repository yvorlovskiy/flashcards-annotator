// Base class for document handling
class DocumentHandler {
    constructor() {
        this.type = 'generic';
    }

    getSelection() {
        throw new Error('Must implement getSelection');
    }

    createHighlight(range, highlightId) {
        throw new Error('Must implement createHighlight');
    }

    restoreHighlight(text, highlightId) {
        throw new Error('Must implement restoreHighlight');
    }

    removeHighlight(element) {
        throw new Error('Must implement removeHighlight');
    }

    getDocumentId() {
        return window.location.href;
    }
}

// Universal document handler that works across different content types
class UniversalDocumentHandler extends DocumentHandler {
    constructor() {
        super();
        this.type = 'universal';
        console.log('UniversalDocumentHandler initialized');
    }

    getSelection() {
        const selection = window.getSelection();
        const text = selection.toString().trim();
        console.log('Getting selection:', {
            hasSelection: !!selection,
            text: text,
            rangeCount: selection.rangeCount,
            parentElement: selection.rangeCount > 0 ? 
                selection.getRangeAt(0).commonAncestorContainer.parentElement : null
        });

        if (!text) return null;

        const range = selection.getRangeAt(0);
        console.log('Selection range:', {
            startOffset: range.startOffset,
            endOffset: range.endOffset,
            startContainer: range.startContainer,
            endContainer: range.endContainer
        });

        return {
            text,
            range: range,
            container: range.commonAncestorContainer
        };
    }

    createHighlight(range, highlightId) {
        console.log('Creating highlight:', {
            highlightId,
            range,
            rangeText: range.toString()
        });

        try {
            // Create wrapper span
            const span = document.createElement('span');
            span.style.backgroundColor = 'yellow';
            span.dataset.highlightId = highlightId;
            span.className = 'universal-highlight';
            
            // Try standard highlight first
            try {
                console.log('Attempting standard highlight');
                range.surroundContents(span);
                console.log('Standard highlight successful');
            } catch (e) {
                console.log('Standard highlight failed, using overlay approach:', e);
                // If standard highlight fails, use overlay approach
                const rect = range.getBoundingClientRect();
                console.log('Range rect:', rect);
                
                span.style.position = 'absolute';
                span.style.left = `${rect.left}px`;
                span.style.top = `${rect.top}px`;
                span.style.width = `${rect.width}px`;
                span.style.height = `${rect.height}px`;
                span.style.pointerEvents = 'none';
                span.textContent = range.toString();
                document.body.appendChild(span);
                console.log('Overlay highlight created');
            }
            
            return span;
        } catch (error) {
            console.error('Error creating highlight:', error);
            return null;
        }
    }

    restoreHighlight(text, highlightId, isLegacy = false) {
        console.log('Restoring highlight:', {
            text,
            highlightId,
            isLegacy
        });

        const textNodes = this.findTextNodesWithContent(document.body, text);
        console.log('Found text nodes:', textNodes.length);
        
        for (const node of textNodes) {
            try {
                const nodeText = node.textContent;
                const index = nodeText.indexOf(text);
                if (index >= 0) {
                    console.log('Found matching text in node:', {
                        nodeText,
                        index,
                        parentElement: node.parentElement
                    });

                    const range = document.createRange();
                    range.setStart(node, index);
                    range.setEnd(node, index + text.length);

                    const highlight = this.createHighlight(range, highlightId);
                    console.log('Highlight restored:', highlight);
                    break;
                }
            } catch (e) {
                console.warn('Could not restore highlight:', {
                    error: e,
                    node,
                    text
                });
            }
        }
    }

    findTextNodesWithContent(node, searchText) {
        console.log('Searching for text:', searchText);
        const textNodes = [];
        const walk = document.createTreeWalker(
            node,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function(node) {
                    const matches = node.textContent.includes(searchText);
                    if (matches) {
                        console.log('Found matching node:', {
                            nodeText: node.textContent,
                            parentElement: node.parentElement
                        });
                    }
                    return matches ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
                }
            }
        );

        while (walk.nextNode()) {
            textNodes.push(walk.currentNode);
        }
        console.log(`Found ${textNodes.length} matching text nodes`);
        return textNodes;
    }

    removeHighlight(element) {
        console.log('Removing highlight:', {
            element,
            isAbsolute: element.style.position === 'absolute',
            highlightId: element.dataset.highlightId
        });

        if (element.style.position === 'absolute') {
            element.remove();
            console.log('Removed absolute highlight');
        } else {
            element.outerHTML = element.textContent;
            console.log('Removed inline highlight');
        }
    }
}

// Update factory to use universal handler
class DocumentHandlerFactory {
    static create() {
        console.log('Creating universal handler');
        return new UniversalDocumentHandler();
    }
} 