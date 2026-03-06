/**
 * Audio Engine - Core Web Audio API wrapper
 * Handles audio loading, playback, and waveform visualization
 */

class AudioEngine {
    constructor() {
        this.audioContext = null;
        this.audioBuffers = new Map();
        this.currentSource = null;
        this.isPlaying = false;
        this.isPaused = false;
        this.startTime = 0;
        this.pauseTime = 0;
        this.loopEnabled = false;
        this.playbackRate = 1.0;

        // Callbacks
        this.onTimeUpdate = null;
        this.onEnded = null;

        this.initAudioContext();
    }

    /**
     * Initialize AudioContext (must be called after user interaction due to autoplay policy)
     */
    initAudioContext() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioContext();
            console.log('AudioContext initialized successfully');
        } catch (error) {
            console.error('Failed to initialize AudioContext:', error);
            throw new Error('Web Audio API is not supported in this browser');
        }
    }

    /**
     * Resume AudioContext (required after user interaction)
     */
    async resumeContext() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
    }

    /**
     * Load an audio file from File object
     * @param {File} file - The audio file to load
     * @returns {Promise<string>} The ID of the loaded audio
     */
    async loadAudioFile(file) {
        const id = this.generateId();

        try {
            const arrayBuffer = await file.arrayBuffer();
            const audioBuffer = await this.decodeAudioData(arrayBuffer);

            // Store audio buffer with metadata
            this.audioBuffers.set(id, {
                buffer: audioBuffer,
                name: file.name,
                duration: audioBuffer.duration,
                sampleRate: audioBuffer.sampleRate,
                channels: audioBuffer.numberOfChannels
            });

            return id;
        } catch (error) {
            console.error('Failed to load audio file:', error);
            throw new Error(`Failed to load audio file: ${error.message}`);
        }
    }

    /**
     * Decode audio data from ArrayBuffer
     * @param {ArrayBuffer} arrayBuffer - The audio data to decode
     * @returns {Promise<AudioBuffer>} The decoded audio buffer
     */
    async decodeAudioData(arrayBuffer) {
        if (!this.audioContext) {
            await this.resumeContext();
        }

        try {
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            return audioBuffer;
        } catch (error) {
            console.error('Failed to decode audio data:', error);
            throw new Error('Failed to decode audio data. The file format may not be supported.');
        }
    }

    /**
     * Get audio buffer by ID
     * @param {string} id - The audio ID
     * @returns {Object|null} The audio data object
     */
    getAudioBuffer(id) {
        return this.audioBuffers.get(id) || null;
    }

    /**
     * Play audio from specified position
     * @param {string} id - The audio ID to play
     * @param {number} offset - Start time in seconds
     * @param {number} duration - Duration to play in seconds (optional)
     */
    async play(id, offset = 0, duration = null) {
        await this.resumeContext();

        // Stop any currently playing audio
        this.stop();

        const audioData = this.audioBuffers.get(id);
        if (!audioData) {
            throw new Error(`Audio with ID ${id} not found`);
        }

        const { buffer } = audioData;

        // Create source node
        this.currentSource = this.audioContext.createBufferSource();
        this.currentSource.buffer = buffer;
        this.currentSource.playbackRate.value = this.playbackRate;
        this.currentSource.loop = this.loopEnabled;

        // Connect to destination
        this.currentSource.connect(this.audioContext.destination);

        // Handle end event
        this.currentSource.onended = () => {
            if (this.isPlaying && !this.loopEnabled) {
                this.isPlaying = false;
                if (this.onEnded) {
                    this.onEnded();
                }
            }
        };

        // Start playback
        const playDuration = duration ? duration : buffer.duration - offset;
        this.currentSource.start(0, offset, playDuration);

        this.isPlaying = true;
        this.startTime = this.audioContext.currentTime - offset;
        this.pauseTime = 0;

        // Start time update tracking
        this.startTimeUpdate();
    }

    /**
     * Pause playback
     */
    pause() {
        if (this.isPlaying && !this.isPaused) {
            this.pauseTime = this.audioContext.currentTime - this.startTime;
            this.stop();
            this.isPaused = true;
        }
    }

    /**
     * Resume playback from pause position
     * @param {string} id - The audio ID to resume
     */
    async resume(id) {
        if (this.isPaused) {
            await this.play(id, this.pauseTime);
            this.isPaused = false;
            this.startTime = this.audioContext.currentTime - this.pauseTime;
        }
    }

    /**
     * Stop playback
     */
    stop() {
        if (this.currentSource) {
            try {
                this.currentSource.stop();
            } catch (error) {
                // Ignore if already stopped
            }
            this.currentSource.disconnect();
            this.currentSource = null;
        }
        this.isPlaying = false;
    }

    /**
     * Get current playback position in seconds
     * @returns {number} Current position in seconds
     */
    getCurrentTime() {
        if (this.isPlaying && this.audioContext) {
            return this.audioContext.currentTime - this.startTime;
        }
        return this.pauseTime;
    }

    /**
     * Set playback rate (speed)
     * @param {number} rate - Playback rate (0.5 to 2.0)
     */
    setPlaybackRate(rate) {
        this.playbackRate = Math.max(0.1, Math.min(2.0, rate));
        if (this.currentSource) {
            this.currentSource.playbackRate.value = this.playbackRate;
        }
    }

    /**
     * Toggle loop mode
     */
    toggleLoop() {
        this.loopEnabled = !this.loopEnabled;
        if (this.currentSource) {
            this.currentSource.loop = this.loopEnabled;
        }
        return this.loopEnabled;
    }

    /**
     * Start time update tracking
     */
    startTimeUpdate() {
        const update = () => {
            if (this.isPlaying && this.onTimeUpdate) {
                this.onTimeUpdate(this.getCurrentTime());
            }
            if (this.isPlaying) {
                requestAnimationFrame(update);
            }
        };
        requestAnimationFrame(update);
    }

    /**
     * Export audio to WAV format
     * @param {ArrayBuffer} audioBuffer - The audio buffer to export
     * @param {Object} options - Export options
     * @returns {Blob} WAV file as blob
     */
    exportToWAV(audioBuffer, options = {}) {
        const {
            sampleRate = audioBuffer.sampleRate,
            bitDepth = 16
        } = options;

        const numberOfChannels = audioBuffer.numberOfChannels;
        const length = audioBuffer.length;
        const format = 1; // PCM
        const bytesPerSample = bitDepth / 8;
        const blockAlign = numberOfChannels * bytesPerSample;
        const byteRate = sampleRate * blockAlign;
        const dataSize = length * blockAlign;
        const bufferSize = 44 + dataSize;

        const arrayBuffer = new ArrayBuffer(bufferSize);
        const view = new DataView(arrayBuffer);

        // WAV header
        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        };

        writeString(0, 'RIFF');
        view.setUint32(4, bufferSize - 8, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true); // Subchunk1Size
        view.setUint16(20, format, true);
        view.setUint16(22, numberOfChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, byteRate, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitDepth, true);
        writeString(36, 'data');
        view.setUint32(40, dataSize, true);

        // Write audio data
        const channels = [];
        for (let i = 0; i < numberOfChannels; i++) {
            channels.push(audioBuffer.getChannelData(i));
        }

        let offset = 44;
        for (let i = 0; i < length; i++) {
            for (let channel = 0; channel < numberOfChannels; channel++) {
                const sample = channels[channel][i];
                const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
                view.setInt16(offset, intSample, true);
                offset += 2;
            }
        }

        return new Blob([arrayBuffer], { type: 'audio/wav' });
    }

    /**
     * Render audio offline for export
     * @param {Array} tracks - Array of track data
     * @param {number} duration - Duration to render
     * @param {number} sampleRate - Sample rate for rendering
     * @returns {Promise<AudioBuffer>} Rendered audio buffer
     */
    async renderOffline(tracks, duration, sampleRate = 44100) {
        const offlineContext = new OfflineAudioContext(
            2, // Stereo
            duration * sampleRate,
            sampleRate
        );

        // Mix all tracks
        for (const track of tracks) {
            if (!track.muted && track.audioData) {
                const source = offlineContext.createBufferSource();
                source.buffer = track.audioData;

                const gainNode = offlineContext.createGain();
                gainNode.gain.value = track.volume;

                const pannerNode = offlineContext.createStereoPanner();
                pannerNode.pan.value = track.pan || 0;

                source.connect(gainNode);
                gainNode.connect(pannerNode);
                pannerNode.connect(offlineContext.destination);

                source.start(track.startTime || 0);
            }
        }

        return await offlineContext.startRendering();
    }

    /**
     * Generate unique ID
     * @returns {string} Unique ID
     */
    generateId() {
        return 'audio_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Clean up resources
     */
    dispose() {
        this.stop();
        if (this.audioContext) {
            this.audioContext.close();
        }
        this.audioBuffers.clear();
    }
}

/**
 * Waveform Visualizer
 * Renders audio waveforms on canvas
 */
class WaveformVisualizer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.audioData = null;
        this.selection = null; // { start, end }
        this.playheadPosition = 0;
        this.zoomLevel = 1;
        this.scrollOffset = 0;
        this.colors = {
            background: '#0a0a0a',
            waveform: '#4a9eff',
            waveformSecondary: '#2a7aef',
            selection: 'rgba(74, 158, 255, 0.3)',
            playhead: '#ff4757',
            grid: '#1a1a1a',
            text: '#808080'
        };

        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    /**
     * Resize canvas to match display size
     */
    resizeCanvas() {
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width * window.devicePixelRatio;
        this.canvas.height = rect.height * window.devicePixelRatio;
        this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        this.width = rect.width;
        this.height = rect.height;
        this.render();
    }

    /**
     * Set audio data for visualization
     * @param {AudioBuffer} audioBuffer - The audio buffer to visualize
     */
    setAudioData(audioBuffer) {
        this.audioData = audioBuffer;
        this.render();
    }

    /**
     * Set selection range
     * @param {number} start - Start time in seconds
     * @param {number} end - End time in seconds
     */
    setSelection(start, end) {
        if (start !== null && end !== null) {
            this.selection = { start, end };
        } else {
            this.selection = null;
        }
        this.render();
    }

    /**
     * Update playhead position
     * @param {number} position - Current position in seconds
     */
    updatePlayhead(position) {
        this.playheadPosition = position;
        this.render();
    }

    /**
     * Set zoom level
     * @param {number} zoom - Zoom level (1 = full waveform visible)
     */
    setZoom(zoom) {
        this.zoomLevel = Math.max(1, Math.min(10, zoom));
        this.render();
    }

    /**
     * Set scroll offset
     * @param {number} offset - Scroll offset in pixels
     */
    setScrollOffset(offset) {
        this.scrollOffset = Math.max(0, offset);
        this.render();
    }

    /**
     * Render the waveform
     */
    render() {
        // Clear canvas
        this.ctx.fillStyle = this.colors.background;
        this.ctx.fillRect(0, 0, this.width, this.height);

        if (!this.audioData) {
            this.renderEmptyState();
            return;
        }

        const duration = this.audioData.duration;
        const pixelsPerSecond = (this.width / duration) * this.zoomLevel;
        const totalWidth = duration * pixelsPerSecond;

        // Draw grid
        this.drawGrid(duration, pixelsPerSecond);

        // Draw waveform
        this.drawWaveform(pixelsPerSecond);

        // Draw selection
        if (this.selection) {
            this.drawSelection(pixelsPerSecond);
        }

        // Draw playhead
        this.drawPlayhead(pixelsPerSecond);
    }

    /**
     * Render empty state
     */
    renderEmptyState() {
        this.ctx.fillStyle = this.colors.text;
        this.ctx.font = '14px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('未加载音频', this.width / 2, this.height / 2);
    }

    /**
     * Draw grid lines
     */
    drawGrid(duration, pixelsPerSecond) {
        this.ctx.strokeStyle = this.colors.grid;
        this.ctx.lineWidth = 1;

        // Determine time interval for grid lines
        let timeInterval = 1; // 1 second default
        const pixelsPerInterval = timeInterval * pixelsPerSecond;

        if (pixelsPerInterval < 50) {
            timeInterval = 5;
        }
        if (pixelsPerInterval < 20) {
            timeInterval = 10;
        }

        // Draw vertical lines
        for (let time = 0; time <= duration; time += timeInterval) {
            const x = time * pixelsPerSecond - this.scrollOffset;
            if (x >= 0 && x <= this.width) {
                this.ctx.beginPath();
                this.ctx.moveTo(x, 0);
                this.ctx.lineTo(x, this.height);
                this.ctx.stroke();
            }
        }

        // Draw center line
        this.ctx.beginPath();
        this.ctx.setLineDash([5, 5]);
        this.ctx.moveTo(0, this.height / 2);
        this.ctx.lineTo(this.width, this.height / 2);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
    }

    /**
     * Draw waveform
     */
    drawWaveform(pixelsPerSecond) {
        const channelData = this.audioData.getChannelData(0);
        const duration = this.audioData.duration;
        const step = Math.ceil(channelData.length / (duration * pixelsPerSecond));

        this.ctx.fillStyle = this.colors.waveform;
        this.ctx.beginPath();

        for (let x = 0; x < this.width; x++) {
            const sampleIndex = Math.floor(((x + this.scrollOffset) / pixelsPerSecond) * this.audioData.sampleRate);
            if (sampleIndex >= channelData.length) break;

            let min = 1.0;
            let max = -1.0;

            for (let i = 0; i < step; i++) {
                const datum = channelData[Math.min(sampleIndex + i, channelData.length - 1)];
                if (datum < min) min = datum;
                if (datum > max) max = datum;
            }

            const yMin = (1 + min) * (this.height / 2);
            const yMax = (1 + max) * (this.height / 2);

            this.ctx.fillRect(x, yMin, 1, yMax - yMin);
        }
    }

    /**
     * Draw selection overlay
     */
    drawSelection(pixelsPerSecond) {
        const startX = this.selection.start * pixelsPerSecond - this.scrollOffset;
        const endX = this.selection.end * pixelsPerSecond - this.scrollOffset;

        this.ctx.fillStyle = this.colors.selection;
        this.ctx.fillRect(startX, 0, endX - startX, this.height);

        // Draw selection borders
        this.ctx.strokeStyle = this.colors.waveform;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(startX, 0);
        this.ctx.lineTo(startX, this.height);
        this.ctx.moveTo(endX, 0);
        this.ctx.lineTo(endX, this.height);
        this.ctx.stroke();
    }

    /**
     * Draw playhead
     */
    drawPlayhead(pixelsPerSecond) {
        const x = this.playheadPosition * pixelsPerSecond - this.scrollOffset;

        this.ctx.strokeStyle = this.colors.playhead;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(x, 0);
        this.ctx.lineTo(x, this.height);
        this.ctx.stroke();

        // Draw playhead triangle
        this.ctx.fillStyle = this.colors.playhead;
        this.ctx.beginPath();
        this.ctx.moveTo(x - 6, 0);
        this.ctx.lineTo(x + 6, 0);
        this.ctx.lineTo(x, 8);
        this.ctx.closePath();
        this.ctx.fill();
    }

    /**
     * Convert pixel position to time
     * @param {number} x - Pixel position
     * @returns {number} Time in seconds
     */
    pixelToTime(x) {
        if (!this.audioData) return 0;
        const pixelsPerSecond = (this.width / this.audioData.duration) * this.zoomLevel;
        return Math.max(0, Math.min(this.audioData.duration, (x + this.scrollOffset) / pixelsPerSecond));
    }

    /**
     * Convert time to pixel position
     * @param {number} time - Time in seconds
     * @returns {number} Pixel position
     */
    timeToPixel(time) {
        if (!this.audioData) return 0;
        const pixelsPerSecond = (this.width / this.audioData.duration) * this.zoomLevel;
        return time * pixelsPerSecond - this.scrollOffset;
    }
}

/**
 * Utility functions
 */
const AudioUtils = {
    /**
     * Format time as MM:SS.mmm
     * @param {number} seconds - Time in seconds
     * @returns {string} Formatted time string
     */
    formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const millis = Math.floor((seconds % 1) * 1000);
        return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
    },

    /**
     * Get file extension from filename
     * @param {string} filename - The filename
     * @returns {string} File extension
     */
    getFileExtension(filename) {
        return filename.slice(((filename.lastIndexOf('.') - 1) >>> 0) + 2).toLowerCase();
    },

    /**
     * Check if file type is supported
     * @param {string} type - MIME type
     * @returns {boolean} True if supported
     */
    isSupportedFileType(type) {
        const supportedTypes = [
            'audio/wav',
            'audio/wave',
            'audio/x-wav',
            'audio/mpeg',
            'audio/mp3',
            'audio/ogg',
            'audio/flac',
            'audio/x-flac'
        ];
        return supportedTypes.includes(type);
    },

    /**
     * Convert dB to linear gain
     * @param {number} db - Decibel value
     * @returns {number} Linear gain value
     */
    dbToLinear(db) {
        return Math.pow(10, db / 20);
    },

    /**
     * Convert linear gain to dB
     * @param {number} linear - Linear gain value
     * @returns {number} Decibel value
     */
    linearToDb(linear) {
        return 20 * Math.log10(linear);
    }
};
