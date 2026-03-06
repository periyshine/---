/**
 * Track Mixer - Multi-track audio mixing with volume, pan, and effects
 */

class Track {
    constructor(id, name, audioEngine) {
        this.id = id;
        this.name = name;
        this.audioEngine = audioEngine;
        this.audioId = null;
        this.audioData = null;

        // Track properties
        this.volume = 1.0;
        this.pan = 0; // -1 (left) to 1 (right)
        this.muted = false;
        this.solo = false;

        // Audio nodes
        this.sourceNode = null;
        this.gainNode = null;
        this.pannerNode = null;

        // Playback
        this.startTime = 0;
        this.offset = 0;
        this.isPlaying = false;

        // UI references
        this.uiElements = {};
    }

    /**
     * Set audio for this track
     * @param {string} audioId - Audio ID from audio engine
     */
    setAudio(audioId) {
        this.audioId = audioId;
        this.audioData = this.audioEngine.getAudioBuffer(audioId);
    }

    /**
     * Create audio nodes for playback
     * @param {AudioContext} audioContext - Audio context
     * @returns {Promise<AudioNode>} Output node
     */
    async createNodes(audioContext) {
        // Create nodes
        this.gainNode = audioContext.createGain();
        this.gainNode.gain.value = this.muted ? 0 : this.volume;

        this.pannerNode = audioContext.createStereoPanner();
        this.pannerNode.pan.value = this.pan;

        // Connect nodes
        this.gainNode.connect(this.pannerNode);

        return this.pannerNode;
    }

    /**
     * Play track
     * @param {AudioContext} audioContext - Audio context
     * @param {number} offset - Start offset in seconds
     * @param {number} duration - Duration to play in seconds (optional)
     */
    async play(audioContext, offset = 0, duration = null) {
        if (!this.audioData || this.muted) return;

        // Stop any existing playback
        this.stop();

        const { buffer } = this.audioData;

        // Create source node
        this.sourceNode = audioContext.createBufferSource();
        this.sourceNode.buffer = buffer;

        // Create and connect nodes
        await this.createNodes(audioContext);
        this.pannerNode.connect(audioContext.destination);

        // Start playback
        if (duration) {
            this.sourceNode.start(0, offset, duration);
        } else {
            this.sourceNode.start(0, offset);
        }

        this.isPlaying = true;
        this.startTime = audioContext.currentTime - offset;
    }

    /**
     * Stop track
     */
    stop() {
        if (this.sourceNode) {
            try {
                this.sourceNode.stop();
            } catch (e) {
                // Ignore if already stopped
            }
            this.sourceNode.disconnect();
            this.sourceNode = null;
        }
        this.isPlaying = false;
    }

    /**
     * Set volume
     * @param {number} volume - Volume (0-1)
     */
    setVolume(volume) {
        this.volume = Math.max(0, Math.min(1, volume));
        if (this.gainNode && !this.muted) {
            this.gainNode.gain.value = this.volume;
        }
    }

    /**
     * Set pan
     * @param {number} pan - Pan value (-1 to 1)
     */
    setPan(pan) {
        this.pan = Math.max(-1, Math.min(1, pan));
        if (this.pannerNode) {
            this.pannerNode.pan.value = this.pan;
        }
    }

    /**
     * Set mute state
     * @param {boolean} muted - Mute state
     */
    setMute(muted) {
        this.muted = muted;
        if (this.gainNode) {
            this.gainNode.gain.value = this.muted ? 0 : this.volume;
        }
    }

    /**
     * Toggle mute
     * @returns {boolean} New mute state
     */
    toggleMute() {
        this.setMute(!this.muted);
        return this.muted;
    }

    /**
     * Set solo state
     * @param {boolean} solo - Solo state
     */
    setSolo(solo) {
        this.solo = solo;
    }

    /**
     * Toggle solo
     * @returns {boolean} New solo state
     */
    toggleSolo() {
        this.solo = !this.solo;
        return this.solo;
    }

    /**
     * Get track duration
     * @returns {number} Duration in seconds
     */
    getDuration() {
        return this.audioData ? this.audioData.duration : 0;
    }

    /**
     * Get clip position in timeline
     * @returns {number} Start time in seconds
     */
    getStartTime() {
        return this.startTime;
    }

    /**
     * Set clip position in timeline
     * @param {number} time - Start time in seconds
     */
    setStartTime(time) {
        this.startTime = time;
    }
}

/**
 * Track Mixer - Manages multiple tracks
 */
class TrackMixer {
    constructor(audioEngine) {
        this.audioEngine = audioEngine;
        this.tracks = new Map();
        this.audioContext = audioEngine.audioContext;
        this.nextTrackId = 1;
        this.isPlaying = false;
        this.startTime = 0;
        this.currentTime = 0;

        // Callbacks
        this.onTimeUpdate = null;
        this.onTracksChange = null;
    }

    /**
     * Create a new track
     * @param {string} name - Track name
     * @returns {Track} New track object
     */
    createTrack(name = null) {
        const id = this.nextTrackId++;
        const trackName = name || `音轨 ${id}`;
        const track = new Track(id, trackName, this.audioEngine);

        this.tracks.set(id, track);
        this.notifyTracksChange();

        return track;
    }

    /**
     * Delete a track
     * @param {number} trackId - Track ID
     * @returns {boolean} True if deleted
     */
    deleteTrack(trackId) {
        const track = this.tracks.get(trackId);
        if (track) {
            track.stop();
            this.tracks.delete(trackId);
            this.notifyTracksChange();
            return true;
        }
        return false;
    }

    /**
     * Get track by ID
     * @param {number} trackId - Track ID
     * @returns {Track|null} Track object
     */
    getTrack(trackId) {
        return this.tracks.get(trackId) || null;
    }

    /**
     * Get all tracks
     * @returns {Array<Track>} Array of tracks
     */
    getAllTracks() {
        return Array.from(this.tracks.values());
    }

    /**
     * Add audio to track
     * @param {number} trackId - Track ID
     * @param {string} audioId - Audio ID
     * @returns {boolean} True if added successfully
     */
    addAudioToTrack(trackId, audioId) {
        const track = this.tracks.get(trackId);
        if (track) {
            track.setAudio(audioId);
            return true;
        }
        return false;
    }

    /**
     * Play all tracks
     * @param {number} offset - Start offset in seconds
     */
    async playAll(offset = 0) {
        // Stop any existing playback
        this.stopAll();

        // Check if any tracks have solo enabled
        const hasSolo = this.getAllTracks().some(track => track.solo);

        // Play each track
        for (const track of this.getAllTracks()) {
            // Skip if muted or if not solo when solo is active
            if (track.muted || (hasSolo && !track.solo)) {
                continue;
            }

            // Calculate offset for this track (accounting for track start time)
            const trackOffset = Math.max(0, offset - track.startTime);
            const remainingDuration = track.getDuration() - trackOffset;

            if (remainingDuration > 0) {
                await track.play(this.audioContext, trackOffset, remainingDuration);
            }
        }

        this.isPlaying = true;
        this.startTime = this.audioContext.currentTime - offset;

        // Start time update tracking
        this.startTimeUpdate();
    }

    /**
     * Stop all tracks
     */
    stopAll() {
        for (const track of this.getAllTracks()) {
            track.stop();
        }
        this.isPlaying = false;
    }

    /**
     * Pause all tracks
     */
    pauseAll() {
        this.currentTime = this.getCurrentTime();
        this.stopAll();
    }

    /**
     * Resume all tracks
     */
    async resumeAll() {
        await this.playAll(this.currentTime);
    }

    /**
     * Get current playback time
     * @returns {number} Current time in seconds
     */
    getCurrentTime() {
        if (this.isPlaying) {
            return this.audioContext.currentTime - this.startTime;
        }
        return this.currentTime;
    }

    /**
     * Seek to position
     * @param {number} time - Time position in seconds
     */
    async seek(time) {
        const wasPlaying = this.isPlaying;
        this.stopAll();
        this.currentTime = time;

        if (wasPlaying) {
            await this.playAll(time);
        }
    }

    /**
     * Get total duration of all tracks
     * @returns {number} Duration in seconds
     */
    getTotalDuration() {
        let maxDuration = 0;
        for (const track of this.getAllTracks()) {
            const trackDuration = track.getDuration();
            const trackEnd = track.startTime + trackDuration;
            if (trackEnd > maxDuration) {
                maxDuration = trackEnd;
            }
        }
        return maxDuration;
    }

    /**
     * Start time update tracking
     */
    startTimeUpdate() {
        const update = () => {
            if (this.isPlaying && this.onTimeUpdate) {
                const currentTime = this.getCurrentTime();
                const totalDuration = this.getTotalDuration();

                if (currentTime >= totalDuration) {
                    this.stopAll();
                } else {
                    this.onTimeUpdate(currentTime);
                }
            }
            if (this.isPlaying) {
                requestAnimationFrame(update);
            }
        };
        requestAnimationFrame(update);
    }

    /**
     * Set track volume
     * @param {number} trackId - Track ID
     * @param {number} volume - Volume (0-1)
     * @returns {boolean} True if successful
     */
    setTrackVolume(trackId, volume) {
        const track = this.tracks.get(trackId);
        if (track) {
            track.setVolume(volume);
            return true;
        }
        return false;
    }

    /**
     * Set track pan
     * @param {number} trackId - Track ID
     * @param {number} pan - Pan value (-1 to 1)
     * @returns {boolean} True if successful
     */
    setTrackPan(trackId, pan) {
        const track = this.tracks.get(trackId);
        if (track) {
            track.setPan(pan);
            return true;
        }
        return false;
    }

    /**
     * Toggle track mute
     * @param {number} trackId - Track ID
     * @returns {boolean|null} New mute state, or null if track not found
     */
    toggleTrackMute(trackId) {
        const track = this.tracks.get(trackId);
        if (track) {
            return track.toggleMute();
        }
        return null;
    }

    /**
     * Toggle track solo
     * @param {number} trackId - Track ID
     * @returns {boolean|null} New solo state, or null if track not found
     */
    toggleTrackSolo(trackId) {
        const track = this.tracks.get(trackId);
        if (track) {
            return track.toggleSolo();
        }
        return null;
    }

    /**
     * Check if any track is soloed
     * @returns {boolean} True if any track is soloed
     */
    hasSolo() {
        return this.getAllTracks().some(track => track.solo);
    }

    /**
     * Apply fade in to track
     * @param {number} trackId - Track ID
     * @param {number} duration - Fade duration in seconds
     * @returns {Promise<string|null>} New audio ID, or null if failed
     */
    async applyTrackFadeIn(trackId, duration = 1.0) {
        const track = this.tracks.get(trackId);
        if (track && track.audioId) {
            // You would need to use the AudioEditor to apply the fade
            // This is a placeholder for the integration
            console.log(`Fade in ${duration}s for track ${trackId}`);
            return track.audioId;
        }
        return null;
    }

    /**
     * Apply fade out to track
     * @param {number} trackId - Track ID
     * @param {number} duration - Fade duration in seconds
     * @returns {Promise<string|null>} New audio ID, or null if failed
     */
    async applyTrackFadeOut(trackId, duration = 1.0) {
        const track = this.tracks.get(trackId);
        if (track && track.audioId) {
            // You would need to use the AudioEditor to apply the fade
            // This is a placeholder for the integration
            console.log(`Fade out ${duration}s for track ${trackId}`);
            return track.audioId;
        }
        return null;
    }

    /**
     * Prepare tracks for offline rendering
     * @returns {Array<Object>} Array of track data for rendering
     */
    prepareForRendering() {
        const trackData = [];

        for (const track of this.getAllTracks()) {
            if (track.audioData && !track.muted) {
                // Check if this track should play (consider solo)
                const hasSolo = this.hasSolo();
                if (hasSolo && !track.solo) {
                    continue;
                }

                trackData.push({
                    audioData: track.audioData.buffer,
                    volume: track.volume,
                    pan: track.pan,
                    muted: track.muted,
                    startTime: track.startTime
                });
            }
        }

        return trackData;
    }

    /**
     * Reset all tracks
     */
    reset() {
        this.stopAll();
        this.tracks.clear();
        this.nextTrackId = 1;
        this.currentTime = 0;
        this.notifyTracksChange();
    }

    /**
     * Notify tracks change callback
     */
    notifyTracksChange() {
        if (this.onTracksChange) {
            this.onTracksChange(this.getAllTracks());
        }
    }

    /**
     * Get mixer state for export
     * @returns {Object} Mixer state
     */
    getState() {
        const trackStates = [];

        for (const track of this.getAllTracks()) {
            trackStates.push({
                id: track.id,
                name: track.name,
                audioId: track.audioId,
                volume: track.volume,
                pan: track.pan,
                muted: track.muted,
                solo: track.solo,
                startTime: track.startTime
            });
        }

        return {
            trackStates,
            nextTrackId: this.nextTrackId
        };
    }

    /**
     * Load mixer state
     * @param {Object} state - Mixer state object
     */
    loadState(state) {
        this.reset();

        for (const trackState of state.trackStates) {
            const track = this.createTrack(trackState.name);
            track.audioId = trackState.audioId;
            track.volume = trackState.volume;
            track.pan = trackState.pan;
            track.muted = trackState.muted;
            track.solo = trackState.solo;
            track.startTime = trackState.startTime;

            if (track.audioId) {
                track.setAudio(track.audioId);
            }
        }

        this.nextTrackId = state.nextTrackId;
    }

    /**
     * Clean up resources
     */
    dispose() {
        this.stopAll();
        this.tracks.clear();
    }
}
