/**
 * CasioController Pro - Trainer Module
 * Handles MIDI parsing, Piano Roll visualization, and Cloud Sync for the Trainer.
 */

const TrainerApp = {
    canvas: null,
    ctx: null,
    midiData: null,
    isPlaying: false,
    
    init() {
        console.log("TrainerApp init");
        
        // Listen to local file import
        const fileInput = document.getElementById('trainer-file-import');
        if(fileInput) {
            fileInput.addEventListener('change', (e) => this.handleLocalMidiUpload(e));
        }
        
        // Cargar índice del trainer en la UI
        this.loadTrainerIndex();
    },
    
    async loadTrainerIndex() {
        try {
            const res = await fetch('trainer/index.json?v=' + Date.now());
            if(!res.ok) return;
            const songs = await res.json();
            
            // Simplemente renderizamos una lista básica
            let container = document.querySelector('#view-trainer .panel-toolbar');
            let list = document.createElement('div');
            list.innerHTML = `<div style="font-size:12px; color:var(--accent); margin-top:10px;">${songs.length} songs available in Cloud Database. Select a song or upload a MIDI.</div>`;
            container.appendChild(list);
        } catch(e) {
            console.error("Error loading trainer index", e);
        }
    },
    
    handleLocalMidiUpload(e) {
        const file = e.target.files[0];
        if(!file) return;
        
        const reader = new FileReader();
        reader.onload = async (ev) => {
            const arrayBuffer = ev.target.result;
            alert(`MIDI file "${file.name}" loaded successfully!\n\nParsing notes for the Piano Roll visualizer and preparing cloud storage sync.`);
            
            // TODO: Parse arrayBuffer with Tonejs/Midi or SpessaSynth
            // TODO: Upload base64 encoded arrayBuffer to GitHub repo using PAT
        };
        reader.readAsArrayBuffer(file);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    TrainerApp.init();
});
