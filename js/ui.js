/**
 * UI Controller - Manages all user interactions
 */

class UIController {
    constructor(audioEngine, audioEditor, mixer, effectsProcessor) {
        this.audioEngine = audioEngine;
        this.audioEditor = audioEditor;
        this.mixer = mixer;
        this.effects = effectsProcessor;

        // Visualizers
        this.mainVisualizer = null;

        // UI state
        this.currentAudioId = null;
        this.isPlaying = false;
        this.loopEnabled = false;
        this.zoomLevel = 1;
        this.effectsPanelVisible = true;

        // Selection state
        this.isSelecting = false;
        this.selectionStart = 0;
        this.selectionEnd = 0;

        // Context menu
        this.contextMenuTarget = null;

        this.init();
    }

    /**
     * Initialize UI
     */
    init() {
        this.initElements();
        this.initVisualizer();
        this.initEventListeners();
        this.initContextMenu();
        this.initDragDrop();
        this.initEffectsPanel();
        this.updateUIState();
    }

    /**
     * Get and cache DOM elements
     */
    initElements() {
        // Buttons
        this.elements = {
            // Import/Export
            btnImport: document.getElementById('btn-import'),
            fileInput: document.getElementById('file-input'),
            btnExport: document.getElementById('btn-export'),
            btnUndo: document.getElementById('btn-undo'),
            btnRedo: document.getElementById('btn-redo'),

            // Playback controls
            btnPlay: document.getElementById('btn-play'),
            btnPause: document.getElementById('btn-pause'),
            btnStop: document.getElementById('btn-stop'),
            btnLoop: document.getElementById('btn-loop'),

            // Zoom
            btnZoomIn: document.getElementById('btn-zoom-in'),
            btnZoomOut: document.getElementById('btn-zoom-out'),

            // Panels
            dropZone: document.getElementById('drop-zone'),
            editorContainer: document.getElementById('editor-container'),
            effectsPanel: document.querySelector('.effects-panel'),
            btnToggleEffects: document.getElementById('btn-toggle-effects'),
            tracksList: document.getElementById('tracks-list'),
            btnAddTrack: document.getElementById('btn-add-track'),

            // Time display
            currentTime: document.getElementById('current-time'),
            totalTime: document.getElementById('total-time'),

            // Waveform
            waveformCanvas: document.getElementById('waveform-canvas'),
            selectionOverlay: document.getElementById('selection-overlay'),

            // Status bar
            statusText: document.getElementById('status-text'),
            sampleRate: document.getElementById('sample-rate'),
            memoryUsage: document.getElementById('memory-usage'),

            // Export dialog
            exportDialog: document.getElementById('export-dialog'),
            btnCloseExport: document.getElementById('btn-close-export'),
            btnCancelExport: document.getElementById('btn-cancel-export'),
            btnDoExport: document.getElementById('btn-do-export'),

            // Loading
            loadingOverlay: document.getElementById('loading-overlay')
        };
    }

    /**
     * Initialize waveform visualizer
     */
    initVisualizer() {
        this.mainVisualizer = new WaveformVisualizer(this.elements.waveformCanvas);

        // Hook up audio engine time updates
        this.audioEngine.onTimeUpdate = (time) => {
            this.mainVisualizer.updatePlayhead(time);
            this.elements.currentTime.textContent = AudioUtils.formatTime(time);
        };

        this.audioEngine.onEnded = () => {
            this.isPlaying = false;
            this.updatePlaybackButtons();
        };
    }

    /**
     * Initialize event listeners
     */
    initEventListeners() {
        // Import
        this.elements.btnImport.addEventListener('click', () => {
            this.elements.fileInput.click();
        });

        this.elements.fileInput.addEventListener('change', (e) => {
            this.handleFileSelect(e.target.files);
        });

        // Export
        this.elements.btnExport.addEventListener('click', () => {
            this.showExportDialog();
        });

        // Undo/Redo
        this.elements.btnUndo.addEventListener('click', () => {
            this.handleUndo();
        });

        this.elements.btnRedo.addEventListener('click', () => {
            this.handleRedo();
        });

        // Playback controls
        this.elements.btnPlay.addEventListener('click', () => {
            this.handlePlay();
        });

        this.elements.btnPause.addEventListener('click', () => {
            this.handlePause();
        });

        this.elements.btnStop.addEventListener('click', () => {
            this.handleStop();
        });

        this.elements.btnLoop.addEventListener('click', () => {
            this.handleLoop();
        });

        // Zoom
        this.elements.btnZoomIn.addEventListener('click', () => {
            this.zoomLevel = Math.min(10, this.zoomLevel + 1);
            this.mainVisualizer.setZoom(this.zoomLevel);
        });

        this.elements.btnZoomOut.addEventListener('click', () => {
            this.zoomLevel = Math.max(1, this.zoomLevel - 1);
            this.mainVisualizer.setZoom(this.zoomLevel);
        });

        // Add track
        this.elements.btnAddTrack.addEventListener('click', () => {
            this.addNewTrack();
        });

        // Export dialog
        this.elements.btnCloseExport.addEventListener('click', () => {
            this.hideExportDialog();
        });

        this.elements.btnCancelExport.addEventListener('click', () => {
            this.hideExportDialog();
        });

        this.elements.btnDoExport.addEventListener('click', () => {
            this.handleExport();
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            this.handleKeyPress(e);
        });

        // Mixer callbacks
        this.mixer.onTimeUpdate = (time) => {
            this.elements.currentTime.textContent = AudioUtils.formatTime(time);
            if (this.mainVisualizer) {
                this.mainVisualizer.updatePlayhead(time);
            }
        };

        this.mixer.onTracksChange = (tracks) => {
            this.renderTracks();
        };
    }

    /**
     * Initialize context menu
     */
    initContextMenu() {
        this.contextMenu = document.getElementById('context-menu');

        document.addEventListener('click', () => {
            this.hideContextMenu();
        });

        this.contextMenu.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const action = item.dataset.action;
                this.handleContextMenuAction(action);
            });
        });
    }

    /**
     * Initialize drag and drop
     */
    initDragDrop() {
        const dropZone = this.elements.dropZone;

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.classList.add('drag-over');
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.classList.remove('drag-over');
            });
        });

        dropZone.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            this.handleFileSelect(files);
        });
    }

    /**
     * Initialize effects panel
     */
    initEffectsPanel() {
        this.elements.btnToggleEffects.addEventListener('click', () => {
            this.toggleEffectsPanel();
        });

        // Initialize effect toggles
        document.querySelectorAll('.toggle-switch input').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const effectName = e.target.dataset.effect;
                const enabled = e.target.checked;
                this.effects.setEffectEnabled(effectName, enabled);
                this.setStatus(`${effectName} ${enabled ? '已启用' : '已禁用'}`);
            });
        });

        // Initialize EQ sliders
        document.querySelectorAll('.eq-slider').forEach(slider => {
            slider.addEventListener('input', (e) => {
                const band = e.target.dataset.band;
                const gain = parseFloat(e.target.value);
                this.effects.setEQGain(band, gain);
                e.target.nextElementSibling.textContent = `${gain > 0 ? '+' : ''}${gain} dB`;
            });
        });

        // Initialize reverb controls
        document.getElementById('reverb-mix').addEventListener('input', (e) => {
            const mix = parseInt(e.target.value);
            this.effects.setReverb(mix, parseFloat(document.getElementById('reverb-decay').value));
            e.target.nextElementSibling.textContent = `${mix}%`;
        });

        document.getElementById('reverb-decay').addEventListener('input', (e) => {
            const decay = parseFloat(e.target.value);
            this.effects.setReverb(parseInt(document.getElementById('reverb-mix').value), decay);
            e.target.nextElementSibling.textContent = `${decay.toFixed(1)}s`;
        });

        // Initialize delay controls
        document.getElementById('delay-time').addEventListener('input', (e) => {
            const time = parseInt(e.target.value);
            this.effects.setDelay(
                time,
                parseInt(document.getElementById('delay-feedback').value),
                parseInt(document.getElementById('delay-mix').value)
            );
            e.target.nextElementSibling.textContent = `${time}ms`;
        });

        document.getElementById('delay-feedback').addEventListener('input', (e) => {
            const feedback = parseInt(e.target.value);
            this.effects.setDelay(
                parseInt(document.getElementById('delay-time').value),
                feedback,
                parseInt(document.getElementById('delay-mix').value)
            );
            e.target.nextElementSibling.textContent = `${feedback}%`;
        });

        document.getElementById('delay-mix').addEventListener('input', (e) => {
            const mix = parseInt(e.target.value);
            this.effects.setDelay(
                parseInt(document.getElementById('delay-time').value),
                parseInt(document.getElementById('delay-feedback').value),
                mix
            );
            e.target.nextElementSibling.textContent = `${mix}%`;
        });

        // Initialize compressor controls
        document.getElementById('compressor-threshold').addEventListener('input', (e) => {
            const threshold = parseInt(e.target.value);
            this.effects.setCompressor(
                threshold,
                parseFloat(document.getElementById('compressor-ratio').value),
                parseInt(document.getElementById('compressor-attack').value),
                parseInt(document.getElementById('compressor-release').value)
            );
            e.target.nextElementSibling.textContent = `${threshold} dB`;
        });

        document.getElementById('compressor-ratio').addEventListener('input', (e) => {
            const ratio = parseFloat(e.target.value);
            this.effects.setCompressor(
                parseInt(document.getElementById('compressor-threshold').value),
                ratio,
                parseInt(document.getElementById('compressor-attack').value),
                parseInt(document.getElementById('compressor-release').value)
            );
            e.target.nextElementSibling.textContent = `${ratio}:1`;
        });

        document.getElementById('compressor-attack').addEventListener('input', (e) => {
            const attack = parseInt(e.target.value);
            this.effects.setCompressor(
                parseInt(document.getElementById('compressor-threshold').value),
                parseFloat(document.getElementById('compressor-ratio').value),
                attack,
                parseInt(document.getElementById('compressor-release').value)
            );
            e.target.nextElementSibling.textContent = `${attack}ms`;
        });

        document.getElementById('compressor-release').addEventListener('input', (e) => {
            const release = parseInt(e.target.value);
            this.effects.setCompressor(
                parseInt(document.getElementById('compressor-threshold').value),
                parseFloat(document.getElementById('compressor-ratio').value),
                parseInt(document.getElementById('compressor-attack').value),
                release
            );
            e.target.nextElementSibling.textContent = `${release}ms`;
        });

        // Initialize filter controls
        document.getElementById('filter-type').addEventListener('change', (e) => {
            this.effects.setFilter(
                e.target.value,
                parseInt(document.getElementById('filter-frequency').value),
                parseFloat(document.getElementById('filter-q').value)
            );
        });

        document.getElementById('filter-frequency').addEventListener('input', (e) => {
            const frequency = parseInt(e.target.value);
            this.effects.setFilter(
                document.getElementById('filter-type').value,
                frequency,
                parseFloat(document.getElementById('filter-q').value)
            );
            e.target.nextElementSibling.textContent = `${frequency} Hz`;
        });

        document.getElementById('filter-q').addEventListener('input', (e) => {
            const q = parseFloat(e.target.value);
            this.effects.setFilter(
                document.getElementById('filter-type').value,
                parseInt(document.getElementById('filter-frequency').value),
                q
            );
            e.target.nextElementSibling.textContent = q.toFixed(1);
        });

        // Initialize distortion controls
        document.getElementById('distortion-drive').addEventListener('input', (e) => {
            const drive = parseInt(e.target.value);
            this.effects.setDistortion(
                drive,
                parseInt(document.getElementById('distortion-mix').value)
            );
            e.target.nextElementSibling.textContent = `${drive}%`;
        });

        document.getElementById('distortion-mix').addEventListener('input', (e) => {
            const mix = parseInt(e.target.value);
            this.effects.setDistortion(
                parseInt(document.getElementById('distortion-drive').value),
                mix
            );
            e.target.nextElementSibling.textContent = `${mix}%`;
        });
    }

    /**
     * Handle file selection
     */
    async handleFileSelect(files) {
        if (files.length === 0) return;

        this.showLoading('加载音频文件...');

        for (const file of files) {
            if (!file.type.startsWith('audio/')) {
                this.setStatus(`跳过非音频文件: ${file.name}`);
                continue;
            }

            try {
                const audioId = await this.audioEngine.loadAudioFile(file);
                const audioData = this.audioEngine.getAudioBuffer(audioId);

                // Create new track for this audio
                const track = this.mixer.createTrack(file.name);
                track.setAudio(audioId);

                // Update visualizer if this is the first audio
                if (!this.currentAudioId) {
                    this.currentAudioId = audioId;
                    this.mainVisualizer.setAudioData(audioData.buffer);
                    this.elements.totalTime.textContent = AudioUtils.formatTime(audioData.duration);
                    this.elements.sampleRate.textContent = `采样率: ${audioData.sampleRate} Hz`;
                }

                this.setStatus(`已加载: ${file.name}`);
            } catch (error) {
                this.setStatus(`加载失败: ${file.name} - ${error.message}`);
                console.error('File load error:', error);
            }
        }

        this.hideLoading();
        this.elements.dropZone.style.display = 'none';
        this.elements.editorContainer.style.display = 'flex';
        this.updateUIState();
    }

    /**
     * Handle play button
     */
    async handlePlay() {
        if (this.isPlaying) return;

        try {
            await this.audioEngine.resumeContext();
            await this.mixer.playAll();
            this.isPlaying = true;
            this.updatePlaybackButtons();
            this.setStatus('播放中');
        } catch (error) {
            this.setStatus(`播放错误: ${error.message}`);
        }
    }

    /**
     * Handle pause button
     */
    handlePause() {
        this.mixer.pauseAll();
        this.isPlaying = false;
        this.updatePlaybackButtons();
        this.setStatus('已暂停');
    }

    /**
     * Handle stop button
     */
    handleStop() {
        this.mixer.stopAll();
        this.isPlaying = false;
        this.updatePlaybackButtons();
        this.mainVisualizer.updatePlayhead(0);
        this.setStatus('已停止');
    }

    /**
     * Handle loop button
     */
    handleLoop() {
        this.loopEnabled = this.audioEngine.toggleLoop();
        this.elements.btnLoop.classList.toggle('active', this.loopEnabled);
        this.setStatus(`循环${this.loopEnabled ? '已启用' : '已禁用'}`);
    }

    /**
     * Handle undo
     */
    handleUndo() {
        const newId = this.audioEditor.undo();
        if (newId) {
            this.currentAudioId = newId;
            const audioData = this.audioEngine.getAudioBuffer(newId);
            this.mainVisualizer.setAudioData(audioData.buffer);
            this.setStatus('已撤销');
        }
        this.updateUIState();
    }

    /**
     * Handle redo
     */
    handleRedo() {
        const newId = this.audioEditor.redo();
        if (newId) {
            this.currentAudioId = newId;
            const audioData = this.audioEngine.getAudioBuffer(newId);
            this.mainVisualizer.setAudioData(audioData.buffer);
            this.setStatus('已重做');
        }
        this.updateUIState();
    }

    /**
     * Handle keyboard shortcuts
     */
    handleKeyPress(e) {
        // Ignore if typing in input field
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }

        switch(e.code) {
            case 'Space':
                e.preventDefault();
                if (this.isPlaying) {
                    this.handlePause();
                } else {
                    this.handlePlay();
                }
                break;
            case 'KeyZ':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    if (e.shiftKey) {
                        this.handleRedo();
                    } else {
                        this.handleUndo();
                    }
                }
                break;
            case 'Escape':
                this.stop();
                break;
            case 'KeyL':
                this.handleLoop();
                break;
        }
    }

    /**
     * Handle context menu action
     */
    handleContextMenuAction(action) {
        if (!this.contextMenuTarget) return;

        const track = this.contextMenuTarget;

        switch(action) {
            case 'split':
                // Handle split
                this.setStatus('分割功能开发中');
                break;
            case 'delete':
                this.mixer.deleteTrack(track.id);
                this.setStatus('已删除音轨');
                break;
            case 'duplicate':
                this.setStatus('复制功能开发中');
                break;
            case 'fade-in':
                this.mixer.applyTrackFadeIn(track.id, 1.0);
                this.setStatus('已应用淡入效果');
                break;
            case 'fade-out':
                this.mixer.applyTrackFadeOut(track.id, 1.0);
                this.setStatus('已应用淡出效果');
                break;
        }

        this.hideContextMenu();
    }

    /**
     * Add new track
     */
    addNewTrack() {
        this.mixer.createTrack();
        this.setStatus('已添加新音轨');
    }

    /**
     * Render tracks
     */
    renderTracks() {
        const tracks = this.mixer.getAllTracks();
        this.elements.tracksList.innerHTML = '';

        for (const track of tracks) {
            const trackElement = this.createTrackElement(track);
            this.elements.tracksList.appendChild(trackElement);
        }
    }

    /**
     * Create track DOM element
     */
    createTrackElement(track) {
        const div = document.createElement('div');
        div.className = 'track';
        div.dataset.trackId = track.id;

        div.innerHTML = `
            <div class="track-info">
                <div class="track-name">${track.name}</div>
                <div class="track-controls">
                    <button class="track-btn solo" title="独奏 ${track.solo ? '(已启用)' : ''}" ${track.solo ? 'class="active"' : ''}>S</button>
                    <button class="track-btn mute" title="静音 ${track.muted ? '(已启用)' : ''}" ${track.muted ? 'class="active"' : ''}>M</button>
                </div>
                <div class="track-volume">
                    <input type="range" min="0" max="100" value="${track.volume * 100}" title="音量">
                </div>
            </div>
            <div class="track-timeline">
                ${track.audioData ? `
                    <div class="clip" style="left: ${track.startTime * 50}px; width: ${track.getDuration() * 50}px;">
                        <canvas class="clip-waveform"></canvas>
                        <span class="clip-name">${track.audioData.name}</span>
                    </div>
                ` : ''}
            </div>
        `;

        // Add event listeners
        const soloBtn = div.querySelector('.solo');
        soloBtn.addEventListener('click', () => {
            track.toggleSolo();
            this.renderTracks();
        });

        const muteBtn = div.querySelector('.mute');
        muteBtn.addEventListener('click', () => {
            track.toggleMute();
            this.renderTracks();
        });

        const volumeSlider = div.querySelector('.track-volume input');
        volumeSlider.addEventListener('input', (e) => {
            const volume = parseInt(e.target.value) / 100;
            track.setVolume(volume);
        });

        // Add context menu
        div.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showContextMenu(e.clientX, e.clientY, track);
        });

        return div;
    }

    /**
     * Show context menu
     */
    showContextMenu(x, y, target) {
        this.contextMenuTarget = target;
        this.contextMenu.style.left = `${x}px`;
        this.contextMenu.style.top = `${y}px`;
        this.contextMenu.style.display = 'block';
    }

    /**
     * Hide context menu
     */
    hideContextMenu() {
        this.contextMenu.style.display = 'none';
        this.contextMenuTarget = null;
    }

    /**
     * Toggle effects panel
     */
    toggleEffectsPanel() {
        this.effectsPanelVisible = !this.effectsPanelVisible;
        this.elements.effectsPanel.classList.toggle('collapsed', !this.effectsPanelVisible);
        this.elements.btnToggleEffects.textContent = this.effectsPanelVisible ? '◀' : '▶';
    }

    /**
     * Show export dialog
     */
    showExportDialog() {
        this.elements.exportDialog.style.display = 'flex';
    }

    /**
     * Hide export dialog
     */
    hideExportDialog() {
        this.elements.exportDialog.style.display = 'none';
    }

    /**
     * Handle export
     */
    async handleExport() {
        this.hideExportDialog();
        this.showLoading('导出音频中...');

        try {
            const filename = document.getElementById('export-filename').value || 'audio_export';
            const format = document.getElementById('export-format').value;
            const sampleRate = parseInt(document.getElementById('export-samplerate').value);

            // Prepare tracks for rendering
            const trackData = this.mixer.prepareForRendering();
            const duration = this.mixer.getTotalDuration();

            // Render offline
            const renderedBuffer = await this.audioEngine.renderOffline(trackData, duration, sampleRate);

            // Export to WAV
            const wavBlob = this.audioEngine.exportToWAV(renderedBuffer, { sampleRate });

            // Download
            const url = URL.createObjectURL(wavBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${filename}.${format}`;
            a.click();
            URL.revokeObjectURL(url);

            this.setStatus('导出完成');
        } catch (error) {
            this.setStatus(`导出失败: ${error.message}`);
            console.error('Export error:', error);
        }

        this.hideLoading();
    }

    /**
     * Update UI state
     */
    updateUIState() {
        this.elements.btnUndo.disabled = !this.audioEditor.canUndo();
        this.elements.btnRedo.disabled = !this.audioEditor.canRedo();

        if (performance.memory) {
            const mb = Math.round(performance.memory.usedJSHeapSize / 1048576);
            this.elements.memoryUsage.textContent = `内存: ${mb} MB`;
        }
    }

    /**
     * Update playback button states
     */
    updatePlaybackButtons() {
        this.elements.btnPlay.classList.toggle('active', this.isPlaying);
        this.elements.btnPause.classList.toggle('active', !this.isPlaying);
    }

    /**
     * Set status text
     */
    setStatus(text) {
        this.elements.statusText.textContent = text;
    }

    /**
     * Show loading overlay
     */
    showLoading(text = '处理中...') {
        this.elements.loadingOverlay.querySelector('.loading-text').textContent = text;
        this.elements.loadingOverlay.style.display = 'flex';
    }

    /**
     * Hide loading overlay
     */
    hideLoading() {
        this.elements.loadingOverlay.style.display = 'none';
    }
}

/**
 * Initialize the application when DOM is ready
 */
document.addEventListener('DOMContentLoaded', () => {
    // Initialize core components
    const audioEngine = new AudioEngine();
    const audioEditor = new AudioEditor(audioEngine);
    const mixer = new TrackMixer(audioEngine);
    const effectsProcessor = new EffectsProcessor(audioEngine.audioContext);

    // Initialize UI
    const ui = new UIController(audioEngine, audioEditor, mixer, effectsProcessor);

    // Create initial track
    mixer.createTrack('音轨 1');

    console.log('Audio Editor initialized successfully');
});
