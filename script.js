// DOM elements
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const pauseBtn = document.getElementById('pauseBtn');
const saveBtn = document.getElementById('saveBtn');
const clearBtn = document.getElementById('clearBtn');
const copyBtn = document.getElementById('copyBtn');
const downloadBtn = document.getElementById('downloadBtn');
const downloadDocxBtn = document.getElementById('downloadDocxBtn');
const themeToggle = document.getElementById('themeToggle');
const output = document.getElementById('output');
const langSelect = document.getElementById('langSelect');
const status = document.getElementById('status');
const stats = document.getElementById('stats');
const visualizer = document.getElementById('visualizer');
const privacyLink = document.getElementById('privacyLink');
const privacyModal = document.getElementById('privacyModal');
const closeModal = document.querySelector('.close');

// Variables for speech recognition
let recognition = null;
let isRecording = false;
let isPaused = false;
let currentTranscript = '';
let audioContext = null;
let analyser = null;
let microphone = null;
let visualizerElements = [];
let animationFrame = null;

// Language-specific vocabulary and rules
const vocabularies = {
    'sv-SE': {
        numbers: /\b(ett|två|tre|fyra|fem|sex|sju|åtta|nio|tio)\b/gi,
        dates: /\b(måndag|tisdag|onsdag|torsdag|fredag|lördag|söndag|januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december)\b/gi,
        commonPhrases: /\b(godmorgon|goddag|godkväll|hejdå|tack|varsågod|förlåt|ursäkta|snälla|vänligen)\b/gi,
        formalPhrases: /\b(härmed|således|följaktligen|dessutom|emellertid|dock|samt|även|enligt|beträffande)\b/gi,
        emotions: /\b(glad|ledsen|arg|rädd|överraskad|trött|stressad|lugn|orolig|nöjd)\b/gi,
        questionWords: /\b(vad|hur|varför|när|var|vem|vilken|vilket|vilka|vems|hurdan|varifrån|vart|varav|varmed|varför|vartill)\b[^.!?]*$/gi,
        exclamations: /\b(wow|fantastiskt|underbart|härligt|otroligt|jättebra|toppen|superbra|kanon|grymt|perfekt|lysande|strålande|utmärkt|brilliant|fenomenalt)\b[^.!?]*$/gi,
        quotations: /\b(sa|säger|berättade|nämnde|frågade|svarade|påstod|menade|förklarade|beskrev|uttryckte|konstaterade|påpekade)\b\s+(att\s+)?([^.!?]+)/gi,
        conjunctions: /\b(och|eller|men|för|att|eftersom|därför|så|när|om|innan|efter|sedan|fastän|trots)\b/gi
    },
    'en-US': {
        questionWords: /\b(what|how|why|when|where|who|which|whose|whom)\b[^.!?]*$/gi,
        exclamations: /\b(wow|amazing|great|awesome|excellent|fantastic|terrific|wonderful|brilliant)\b[^.!?]*$/gi,
        quotations: /\b(said|says|told|mentioned|asked|answered|claimed|meant|explained|described|expressed|stated|pointed out)\b\s+(that\s+)?([^.!?]+)/gi,
        conjunctions: /\b(and|or|but|because|since|as|so|when|if|while|after|before|though|although)\b/gi
    }
};

// Initialize speech recognition
function initializeSpeechRecognition() {
    try {
        if ('webkitSpeechRecognition' in window) {
            recognition = new webkitSpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.maxAlternatives = 3;
            recognition.lang = langSelect.value;

            setupRecognitionHandlers();
            createVisualizer();
        } else if ('SpeechRecognition' in window) {
            // Standard API when available
            recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.maxAlternatives = 3;
            recognition.lang = langSelect.value;

            setupRecognitionHandlers();
            createVisualizer();
        } else {
            status.textContent = "Speech recognition not supported in this browser.";
            status.style.color = "var(--error-color)";
            disableButtons();
        }
    } catch (error) {
        handleError("Error initializing speech recognition:", error);
    }
}

// Setup event handlers for the speech recognition
function setupRecognitionHandlers() {
    recognition.onstart = () => {
        status.textContent = "Listening...";
        status.style.backgroundColor = "var(--success-color)";
        status.style.color = "white";
        isRecording = true;
        updateButtonStates();
        startVisualization();
    };

    recognition.onend = () => {
        if (isRecording && !isPaused) {
            try {
                recognition.start();
            } catch (error) {
                handleError("Error restarting recognition:", error);
            }
        } else {
            status.textContent = isPaused ? "Paused. Click Start to resume." : "Recording stopped.";
            status.style.backgroundColor = isPaused ? "var(--warning-color)" : "var(--primary-light)";
            status.style.color = isPaused ? "white" : "var(--primary-color)";
            updateButtonStates();
            stopVisualization();
        }
    };

    recognition.onerror = (event) => {
        if (event.error !== 'no-speech') {
            handleError(`Recognition error: ${event.error}`, null);
            isRecording = false;
            isPaused = false;
            updateButtonStates();
            stopVisualization();
        }
    };

    recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalTranscript += smartPunctuation(transcript) + ' ';
            } else {
                interimTranscript += transcript;
            }
        }

        if (finalTranscript) {
            currentTranscript += finalTranscript;
            output.value = currentTranscript;
            output.scrollTop = output.scrollHeight;
            updateStats();
        }
    };
}

// Update button states based on recording status
function updateButtonStates() {
    startBtn.disabled = isRecording && !isPaused;
    stopBtn.disabled = !isRecording || isPaused;
    pauseBtn.disabled = !isRecording || isPaused;
    startBtn.classList.toggle('recording', isRecording && !isPaused);
}

// Disable all recording-related buttons
function disableButtons() {
    startBtn.disabled = true;
    stopBtn.disabled = true;
    pauseBtn.disabled = true;
}

// Apply language-specific rules for punctuation and formatting
function smartPunctuation(text) {
    const lang = recognition.lang;
    text = text.trim().replace(/\s+/g, ' ');

    // Get the appropriate vocabulary for the current language
    const vocab = vocabularies[lang] || vocabularies['en-US'];

    if (lang === 'sv-SE') {
        // Apply Swedish rules
        if (vocab.questionWords) {
            text = text.replace(vocab.questionWords, match => `${match}?`);
        }
        if (vocab.exclamations) {
            text = text.replace(vocab.exclamations, match => `${match}!`);
        }
        if (vocab.quotations) {
            text = text.replace(vocab.quotations, (_, verb, att, speech) => `${verb} "${speech.trim()}"`);
        }

        // Apply Swedish vocabulary rules
        Object.keys(vocabularies['sv-SE']).forEach(ruleKey => {
            const rule = vocabularies['sv-SE'][ruleKey];
            if (rule && typeof rule.test === 'function') {
                text = text.replace(rule, match => 
                    match.charAt(0).toUpperCase() + match.slice(1).toLowerCase());
            }
        });
    } else if (lang.startsWith('en')) {
        // Apply English rules
        if (vocab.questionWords) {
            text = text.replace(vocab.questionWords, match => `${match}?`);
        }
        if (vocab.exclamations) {
            text = text.replace(vocab.exclamations, match => `${match}!`);
        }
        if (vocab.quotations) {
            text = text.replace(vocab.quotations, (_, verb, that, speech) => `${verb} "${speech.trim()}"`);
        }
    }

    // Apply common formatting for all languages
    text = applyCommonFormatting(text);
    
    return text;
}

// Apply common text formatting rules
function applyCommonFormatting(text) {
    // Capitalize after periods, exclamation marks, and question marks
    text = text.replace(/([.!?])\s*([a-zA-Z])/g, (_, punct, letter) => 
        `${punct} ${letter.toUpperCase()}`);
    
    // Add commas before conjunctions in the middle of sentences
    const lang = recognition.lang;
    const vocab = vocabularies[lang] || vocabularies['en-US'];
    
    if (vocab.conjunctions) {
        text = text.replace(new RegExp(`\\s+(${vocab.conjunctions.source.slice(2, -2)})\\s+`, 'gi'), 
            (match, conj) => `, ${conj.toLowerCase()} `);
    }
    
    // Capitalize first letter of the sentence
    text = text.charAt(0).toUpperCase() + text.slice(1);
    
    // Add period at the end if there's no punctuation
    if (!text.match(/[.!?]$/)) {
        text += '.';
    }

    return text;
}

// Create audio visualizer
function createVisualizer() {
    // Create visualizer bars
    visualizer.innerHTML = '';
    for (let i = 0; i < 20; i++) {
        const bar = document.createElement('span');
        visualizer.appendChild(bar);
        visualizerElements.push(bar);
    }
}

// Start audio visualization
function startVisualization() {
    try {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(stream => {
                    microphone = audioContext.createMediaStreamSource(stream);
                    microphone.connect(analyser);
                    visualize();
                })
                .catch(error => {
                    handleError("Error accessing microphone:", error);
                    // Continue with recording even if visualization fails
                });
        } else {
            visualize();
        }
    } catch (error) {
        handleError("Error starting visualization:", error);
        // Continue with recording even if visualization fails
    }
}

// Perform visualization
function visualize() {
    if (!analyser) return;
    
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    function draw() {
        if (!isRecording || isPaused) return;
        
        animationFrame = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);
        
        const step = Math.floor(bufferLength / visualizerElements.length);
        
        for (let i = 0; i < visualizerElements.length; i++) {
            const value = dataArray[i * step];
            const height = Math.max(3, value * 0.5); // Max height of 50px
            visualizerElements[i].style.height = `${height}px`;
            
            // Set color based on frequency
            const hue = (i / visualizerElements.length) * 180 + 200;
            visualizerElements[i].style.backgroundColor = `hsl(${hue}, 80%, 60%)`;
        }
    }
    
    draw();
}

// Stop visualization
function stopVisualization() {
    if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
    }
    
    // Reset visualizer bars
    visualizerElements.forEach(element => {
        element.style.height = '3px';
    });
}

// Update word and character count
function updateStats() {
    const text = output.value;
    const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
    const charCount = text.length;
    
    stats.textContent = `Words: ${wordCount} | Characters: ${charCount}`;
}

// Error handling
function handleError(message, error) {
    console.error(message, error);
    status.textContent = message + (error ? ` ${error.message}` : '');
    status.style.backgroundColor = "var(--error-color)";
    status.style.color = "white";
}

// Save transcript to file
function saveTranscript(format = 'txt') {
    if (!output.value.trim()) {
        status.textContent = "Nothing to save!";
        status.style.backgroundColor = "var(--warning-color)";
        status.style.color = "white";
        setTimeout(() => {
            status.textContent = "Ready to record...";
            status.style.backgroundColor = "var(--primary-light)";
            status.style.color = "var(--primary-color)";
        }, 2000);
        return;
    }

    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const language = langSelect.options[langSelect.selectedIndex].text;
        let filename = `transcript-${language}-${timestamp}`;
        let blob;
        let url;

        if (format === 'docx') {
            // Simple DOCX creation (very basic implementation)
            // For a real app, use a proper library like docx-js
            const xmlContent = `
                <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
                    <w:body>
                        <w:p>
                            <w:r>
                                <w:t>${output.value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</w:t>
                            </w:r>
                        </w:p>
                    </w:body>
                </w:document>
            `;
            blob = new Blob([xmlContent], {type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
            filename += '.docx';
        } else {
            // Text file
            blob = new Blob([output.value], {type: 'text/plain'});
            filename += '.txt';
        }

        url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        status.textContent = `Transcript saved as ${filename}`;
        status.style.backgroundColor = "var(--success-color)";
        status.style.color = "white";
        setTimeout(() => {
            status.textContent = "Ready to record...";
            status.style.backgroundColor = "var(--primary-light)";
            status.style.color = "var(--primary-color)";
        }, 2000);
    } catch (error) {
        handleError("Error saving transcript:", error);
    }
}

// Toggle between light and dark theme
function toggleTheme() {
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    document.body.setAttribute('data-theme', isDark ? 'light' : 'dark');
    localStorage.setItem('theme', isDark ? 'light' : 'dark');
    themeToggle.innerHTML = isDark ? '<i class="fas fa-moon"></i>' : '<i class="fas fa-sun"></i>';
}

// Load saved theme from localStorage
function loadSavedTheme() {
    const savedTheme = localStorage.getItem('theme') || 
                      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.body.setAttribute('data-theme', savedTheme);
    themeToggle.innerHTML = savedTheme === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
}

// Event Listeners
startBtn.addEventListener('click', () => {
    try {
        currentTranscript = output.value;
        isPaused = false;
        isRecording = true;
        recognition.start();
        updateButtonStates();
    } catch (error) {
        handleError("Error starting recording:", error);
    }
});

stopBtn.addEventListener('click', () => {
    try {
        isRecording = false;
        isPaused = false;
        recognition.stop();
        updateButtonStates();
    } catch (error) {
        handleError("Error stopping recording:", error);
    }
});

pauseBtn.addEventListener('click', () => {
    try {
        isPaused = true;
        recognition.stop();
        status.textContent = "Paused";
        status.style.backgroundColor = "var(--warning-color)";
        status.style.color = "white";
        updateButtonStates();
        stopVisualization();
    } catch (error) {
        handleError("Error pausing recording:", error);
    }
});

saveBtn.addEventListener('click', () => {
    saveTranscript('txt');
});

clearBtn.addEventListener('click', () => {
    if (confirm("Are you sure you want to clear all text?")) {
        output.value = '';
        currentTranscript = '';
        updateStats();
    }
});

copyBtn.addEventListener('click', () => {
    try {
        output.select();
        document.execCommand('copy');
        // Modern API (if available)
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(output.value);
        }
        
        status.textContent = "Text copied to clipboard!";
        status.style.backgroundColor = "var(--success-color)";
        status.style.color = "white";
        setTimeout(() => {
            status.textContent = "Ready to record...";
            status.style.backgroundColor = "var(--primary-light)";
            status.style.color = "var(--primary-color)";
        }, 2000);
    } catch (error) {
        handleError("Error copying to clipboard:", error);
    }
});

downloadBtn.addEventListener('click', () => {
    saveTranscript('txt');
});

downloadDocxBtn.addEventListener('click', () => {
    saveTranscript('docx');
});

langSelect.addEventListener('change', () => {
    try {
        if (isRecording) {
            recognition.stop();
        }
        recognition.lang = langSelect.value;
        status.textContent = `Language changed to: ${langSelect.options[langSelect.selectedIndex].text}`;
        status.style.backgroundColor = "var(--primary-light)";
        status.style.color = "var(--primary-color)";
    } catch (error) {
        handleError("Error changing language:", error);
    }
});

output.addEventListener('input', updateStats);

themeToggle.addEventListener('click', toggleTheme);

privacyLink.addEventListener('click', (e) => {
    e.preventDefault();
    privacyModal.style.display = "block";
});

closeModal.addEventListener('click', () => {
    privacyModal.style.display = "none";
});

window.addEventListener('click', (e) => {
    if (e.target === privacyModal) {
        privacyModal.style.display = "none";
    }
});

// Listen for speech recognition availability
if ('onvoiceschanged' in speechSynthesis) {
    speechSynthesis.onvoiceschanged = function() {
        // If recognition is initialized after voices are loaded, it may work better
        initializeSpeechRecognition();
    };
} else {
    // If the event is not supported, initialize directly
    initializeSpeechRecognition();
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    loadSavedTheme();
    initializeSpeechRecognition();
    updateStats();
    
    // Handle page visibility changes
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && isRecording) {
            // Auto-pause when switching tabs or minimizing
            isPaused = true;
            recognition.stop();
            updateButtonStates();
        }
    });
    
    // Handle before unload
    window.addEventListener('beforeunload', (e) => {
        if (output.value && output.value.trim().length > 0) {
            // Warn user about unsaved transcripts
            e.preventDefault();
            e.returnValue = '';
            return '';
        }
    });
});
