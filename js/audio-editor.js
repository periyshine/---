/**
 * Audio Editor - Handles audio editing operations
 * Supports cropping, splitting, concatenating, and undo/redo
 */

class AudioEditor {
    constructor(audioEngine) {
        this.audioEngine = audioEngine;
        this.undoStack = [];
        this.redoStack = [];
        this.maxUndoSteps = 50;

        // Current selection
        this.selection = {
            start: null,
            end: null,
            audioId: null
        };
    }

    /**
     * Crop audio to specified range
     * @param {string} audioId - The audio ID to crop
     * @param {number} startTime - Start time in seconds
     * @param {number} endTime - End time in seconds
     * @returns {Promise<string>} New audio ID
     */
    async cropAudio(audioId, startTime, endTime) {
        const audioData = this.audioEngine.getAudioBuffer(audioId);
        if (!audioData) {
            throw new Error('Audio not found');
        }

        const { buffer } = audioData;

        // Validate time range
        if (startTime < 0 || endTime > buffer.duration || startTime >= endTime) {
            throw new Error('Invalid time range');
        }

        // Save state for undo
        this.saveState(audioId, 'crop');

        // Calculate sample positions
        const startSample = Math.floor(startTime * buffer.sampleRate);
        const endSample = Math.floor(endTime * buffer.sampleRate);
        const newLength = endSample - startSample;

        // Create new buffer
        const audioContext = this.audioEngine.audioContext;
        const newBuffer = audioContext.createBuffer(
            buffer.numberOfChannels,
            newLength,
            buffer.sampleRate
        );

        // Copy channel data
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
            const oldData = buffer.getChannelData(channel);
            const newData = newBuffer.getChannelData(channel);
            newData.set(oldData.subarray(startSample, endSample));
        }

        // Store new buffer
        const newId = this.audioEngine.generateId();
        this.audioEngine.audioBuffers.set(newId, {
            buffer: newBuffer,
            name: audioData.name + '_cropped',
            duration: newBuffer.duration,
            sampleRate: newBuffer.sampleRate,
            channels: newBuffer.numberOfChannels
        });

        return newId;
    }

    /**
     * Split audio at specified position
     * @param {string} audioId - The audio ID to split
     * @param {number} splitTime - Time position to split at
     * @returns {Promise<Array<string>>} Array of two new audio IDs
     */
    async splitAudio(audioId, splitTime) {
        const audioData = this.audioEngine.getAudioBuffer(audioId);
        if (!audioData) {
            throw new Error('Audio not found');
        }

        const { buffer } = audioData;

        // Validate split time
        if (splitTime <= 0 || splitTime >= buffer.duration) {
            throw new Error('Invalid split time');
        }

        // Save state for undo
        this.saveState(audioId, 'split');

        const audioContext = this.audioEngine.audioContext;
        const splitSample = Math.floor(splitTime * buffer.sampleRate);

        // Create two new buffers
        const buffer1 = audioContext.createBuffer(
            buffer.numberOfChannels,
            splitSample,
            buffer.sampleRate
        );

        const buffer2 = audioContext.createBuffer(
            buffer.numberOfChannels,
            buffer.length - splitSample,
            buffer.sampleRate
        );

        // Copy channel data for both parts
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
            const oldData = buffer.getChannelData(channel);
            const data1 = buffer1.getChannelData(channel);
            const data2 = buffer2.getChannelData(channel);

            data1.set(oldData.subarray(0, splitSample));
            data2.set(oldData.subarray(splitSample));
        }

        // Store new buffers
        const id1 = this.audioEngine.generateId();
        const id2 = this.audioEngine.generateId();

        this.audioEngine.audioBuffers.set(id1, {
            buffer: buffer1,
            name: audioData.name + '_part1',
            duration: buffer1.duration,
            sampleRate: buffer1.sampleRate,
            channels: buffer1.numberOfChannels
        });

        this.audioEngine.audioBuffers.set(id2, {
            buffer: buffer2,
            name: audioData.name + '_part2',
            duration: buffer2.duration,
            sampleRate: buffer2.sampleRate,
            channels: buffer2.numberOfChannels
        });

        return [id1, id2];
    }

    /**
     * Concatenate multiple audio clips
     * @param {Array<string>} audioIds - Array of audio IDs to concatenate
     * @param {string} outputName - Name for the output audio
     * @returns {Promise<string>} New audio ID
     */
    async concatenateAudio(audioIds, outputName = 'concatenated_audio') {
        if (audioIds.length < 2) {
            throw new Error('Need at least 2 audio clips to concatenate');
        }

        // Get all audio data
        const audioDataArray = audioIds.map(id => {
            const data = this.audioEngine.getAudioBuffer(id);
            if (!data) {
                throw new Error(`Audio with ID ${id} not found`);
            }
            return data;
        });

        // Use sample rate from first audio
        const sampleRate = audioDataArray[0].sampleRate;
        const channels = audioDataArray[0].channels;
        const audioContext = this.audioEngine.audioContext;

        // Calculate total length
        let totalLength = 0;
        for (const data of audioDataArray) {
            // Convert to common sample rate if needed
            if (data.sampleRate !== sampleRate) {
                throw new Error('All audio must have the same sample rate');
            }
            if (data.channels !== channels) {
                throw new Error('All audio must have the same number of channels');
            }
            totalLength += data.buffer.length;
        }

        // Create new buffer
        const newBuffer = audioContext.createBuffer(channels, totalLength, sampleRate);

        // Copy channel data
        for (let channel = 0; channel < channels; channel++) {
            const newData = newBuffer.getChannelData(channel);
            let offset = 0;

            for (const data of audioDataArray) {
                const oldData = data.buffer.getChannelData(channel);
                newData.set(oldData, offset);
                offset += oldData.length;
            }
        }

        // Store new buffer
        const newId = this.audioEngine.generateId();
        this.audioEngine.audioBuffers.set(newId, {
            buffer: newBuffer,
            name: outputName,
            duration: newBuffer.duration,
            sampleRate: newBuffer.sampleRate,
            channels: newBuffer.numberOfChannels
        });

        return newId;
    }

    /**
     * Apply fade in effect
     * @param {string} audioId - The audio ID
     * @param {number} duration - Fade duration in seconds
     * @returns {string} New audio ID
     */
    async applyFadeIn(audioId, duration = 1.0) {
        const audioData = this.audioEngine.getAudioBuffer(audioId);
        if (!audioData) {
            throw new Error('Audio not found');
        }

        const { buffer } = audioData;
        const audioContext = this.audioEngine.audioContext;

        // Create new buffer
        const newBuffer = audioContext.createBuffer(
            buffer.numberOfChannels,
            buffer.length,
            buffer.sampleRate
        );

        const fadeSamples = Math.floor(duration * buffer.sampleRate);

        // Apply fade to each channel
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
            const oldData = buffer.getChannelData(channel);
            const newData = newBuffer.getChannelData(channel);

            for (let i = 0; i < buffer.length; i++) {
                if (i < fadeSamples) {
                    newData[i] = oldData[i] * (i / fadeSamples);
                } else {
                    newData[i] = oldData[i];
                }
            }
        }

        // Store new buffer
        const newId = this.audioEngine.generateId();
        this.audioEngine.audioBuffers.set(newId, {
            buffer: newBuffer,
            name: audioData.name + '_fadein',
            duration: newBuffer.duration,
            sampleRate: newBuffer.sampleRate,
            channels: newBuffer.numberOfChannels
        });

        return newId;
    }

    /**
     * Apply fade out effect
     * @param {string} audioId - The audio ID
     * @param {number} duration - Fade duration in seconds
     * @returns {string} New audio ID
     */
    async applyFadeOut(audioId, duration = 1.0) {
        const audioData = this.audioEngine.getAudioBuffer(audioId);
        if (!audioData) {
            throw new Error('Audio not found');
        }

        const { buffer } = audioData;
        const audioContext = this.audioEngine.audioContext;

        // Create new buffer
        const newBuffer = audioContext.createBuffer(
            buffer.numberOfChannels,
            buffer.length,
            buffer.sampleRate
        );

        const fadeSamples = Math.floor(duration * buffer.sampleRate);

        // Apply fade to each channel
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
            const oldData = buffer.getChannelData(channel);
            const newData = newBuffer.getChannelData(channel);

            for (let i = 0; i < buffer.length; i++) {
                if (i > buffer.length - fadeSamples) {
                    const fadePosition = i - (buffer.length - fadeSamples);
                    newData[i] = oldData[i] * (1 - fadePosition / fadeSamples);
                } else {
                    newData[i] = oldData[i];
                }
            }
        }

        // Store new buffer
        const newId = this.audioEngine.generateId();
        this.audioEngine.audioBuffers.set(newId, {
            buffer: newBuffer,
            name: audioData.name + '_fadeout',
            duration: newBuffer.duration,
            sampleRate: newBuffer.sampleRate,
            channels: newBuffer.numberOfChannels
        });

        return newId;
    }

    /**
     * Reverse audio
     * @param {string} audioId - The audio ID
     * @returns {string} New audio ID
     */
    async reverseAudio(audioId) {
        const audioData = this.audioEngine.getAudioBuffer(audioId);
        if (!audioData) {
            throw new Error('Audio not found');
        }

        const { buffer } = audioData;
        const audioContext = this.audioEngine.audioContext;

        // Create new buffer
        const newBuffer = audioContext.createBuffer(
            buffer.numberOfChannels,
            buffer.length,
            buffer.sampleRate
        );

        // Reverse each channel
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
            const oldData = buffer.getChannelData(channel);
            const newData = newBuffer.getChannelData(channel);

            for (let i = 0; i < buffer.length; i++) {
                newData[i] = oldData[buffer.length - 1 - i];
            }
        }

        // Store new buffer
        const newId = this.audioEngine.generateId();
        this.audioEngine.audioBuffers.set(newId, {
            buffer: newBuffer,
            name: audioData.name + '_reversed',
            duration: newBuffer.duration,
            sampleRate: newBuffer.sampleRate,
            channels: newBuffer.numberOfChannels
        });

        return newId;
    }

    /**
     * Normalize audio to specified level
     * @param {string} audioId - The audio ID
     * @param {number} targetLevel - Target peak level (0 to 1)
     * @returns {string} New audio ID
     */
    async normalizeAudio(audioId, targetLevel = 0.95) {
        const audioData = this.audioEngine.getAudioBuffer(audioId);
        if (!audioData) {
            throw new Error('Audio not found');
        }

        const { buffer } = audioData;
        const audioContext = this.audioEngine.audioContext;

        // Find peak level
        let peak = 0;
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
            const data = buffer.getChannelData(channel);
            for (let i = 0; i < buffer.length; i++) {
                const abs = Math.abs(data[i]);
                if (abs > peak) {
                    peak = abs;
                }
            }
        }

        if (peak === 0) {
            return audioId; // Silent audio, nothing to normalize
        }

        const normalizationFactor = targetLevel / peak;

        // Create new buffer
        const newBuffer = audioContext.createBuffer(
            buffer.numberOfChannels,
            buffer.length,
            buffer.sampleRate
        );

        // Apply normalization
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
            const oldData = buffer.getChannelData(channel);
            const newData = newBuffer.getChannelData(channel);

            for (let i = 0; i < buffer.length; i++) {
                newData[i] = oldData[i] * normalizationFactor;
            }
        }

        // Store new buffer
        const newId = this.audioEngine.generateId();
        this.audioEngine.audioBuffers.set(newId, {
            buffer: newBuffer,
            name: audioData.name + '_normalized',
            duration: newBuffer.duration,
            sampleRate: newBuffer.sampleRate,
            channels: newBuffer.numberOfChannels
        });

        return newId;
    }

    /**
     * Trim silence from beginning and end
     * @param {string} audioId - The audio ID
     * @param {number} threshold - Silence threshold (0 to 1)
     * @returns {string} New audio ID
     */
    async trimSilence(audioId, threshold = 0.01) {
        const audioData = this.audioEngine.getAudioBuffer(audioId);
        if (!audioData) {
            throw new Error('Audio not found');
        }

        const { buffer } = audioData;

        // Find start of audio
        let startSample = 0;
        for (let i = 0; i < buffer.length; i++) {
            let isSilent = true;
            for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
                if (Math.abs(buffer.getChannelData(channel)[i]) > threshold) {
                    isSilent = false;
                    break;
                }
            }
            if (!isSilent) {
                startSample = i;
                break;
            }
        }

        // Find end of audio
        let endSample = buffer.length - 1;
        for (let i = buffer.length - 1; i >= startSample; i--) {
            let isSilent = true;
            for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
                if (Math.abs(buffer.getChannelData(channel)[i]) > threshold) {
                    isSilent = false;
                    break;
                }
            }
            if (!isSilent) {
                endSample = i;
                break;
            }
        }

        if (endSample > startSample) {
            const startTime = startSample / buffer.sampleRate;
            const endTime = endSample / buffer.sampleRate;
            return await this.cropAudio(audioId, startTime, endTime);
        }

        return audioId; // No silence to trim
    }

    /**
     * Set selection range
     * @param {string} audioId - The audio ID
     * @param {number} start - Start time in seconds
     * @param {number} end - End time in seconds
     */
    setSelection(audioId, start, end) {
        this.selection = {
            audioId,
            start,
            end
        };
    }

    /**
     * Clear selection
     */
    clearSelection() {
        this.selection = {
            audioId: null,
            start: null,
            end: null
        };
    }

    /**
     * Get selection
     * @returns {Object} Selection object
     */
    getSelection() {
        return this.selection;
    }

    /**
     * Save state for undo
     * @param {string} audioId - The audio ID
     * @param {string} operation - Operation type
     */
    saveState(audioId, operation) {
        const audioData = this.audioEngine.getAudioBuffer(audioId);
        if (!audioData) return;

        // Deep copy the buffer
        const audioContext = this.audioEngine.audioContext;
        const bufferClone = audioContext.createBuffer(
            audioData.buffer.numberOfChannels,
            audioData.buffer.length,
            audioData.buffer.sampleRate
        );

        for (let channel = 0; channel < audioData.buffer.numberOfChannels; channel++) {
            const oldData = audioData.buffer.getChannelData(channel);
            const newData = bufferClone.getChannelData(channel);
            newData.set(oldData);
        }

        const state = {
            audioId,
            operation,
            buffer: bufferClone,
            metadata: { ...audioData }
        };

        this.undoStack.push(state);

        // Limit undo stack size
        if (this.undoStack.length > this.maxUndoSteps) {
            this.undoStack.shift();
        }

        // Clear redo stack on new operation
        this.redoStack = [];
    }

    /**
     * Undo last operation
     * @returns {string|null} Audio ID of restored state, or null if nothing to undo
     */
    undo() {
        if (this.undoStack.length === 0) {
            return null;
        }

        const state = this.undoStack.pop();

        // Get current state for redo
        const currentAudioData = this.audioEngine.getAudioBuffer(state.audioId);
        if (currentAudioData) {
            const audioContext = this.audioEngine.audioContext;
            const currentBufferClone = audioContext.createBuffer(
                currentAudioData.buffer.numberOfChannels,
                currentAudioData.buffer.length,
                currentAudioData.buffer.sampleRate
            );

            for (let channel = 0; channel < currentAudioData.buffer.numberOfChannels; channel++) {
                const currentData = currentAudioData.buffer.getChannelData(channel);
                const currentClone = currentBufferClone.getChannelData(channel);
                currentClone.set(currentData);
            }

            this.redoStack.push({
                audioId: state.audioId,
                operation: state.operation,
                buffer: currentBufferClone,
                metadata: { ...currentAudioData }
            });
        }

        // Restore previous state
        const newId = this.audioEngine.generateId();
        this.audioEngine.audioBuffers.set(newId, {
            buffer: state.buffer,
            name: state.metadata.name,
            duration: state.buffer.duration,
            sampleRate: state.buffer.sampleRate,
            channels: state.buffer.numberOfChannels
        });

        return newId;
    }

    /**
     * Redo last undone operation
     * @returns {string|null} Audio ID of redone state, or null if nothing to redo
     */
    redo() {
        if (this.redoStack.length === 0) {
            return null;
        }

        const state = this.redoStack.pop();

        // Push current state back to undo stack
        const currentAudioData = this.audioEngine.getAudioBuffer(state.audioId);
        if (currentAudioData) {
            const audioContext = this.audioEngine.audioContext;
            const currentBufferClone = audioContext.createBuffer(
                currentAudioData.buffer.numberOfChannels,
                currentAudioData.buffer.length,
                currentAudioData.buffer.sampleRate
            );

            for (let channel = 0; channel < currentAudioData.buffer.numberOfChannels; channel++) {
                const currentData = currentAudioData.buffer.getChannelData(channel);
                const currentClone = currentBufferClone.getChannelData(channel);
                currentClone.set(currentData);
            }

            this.undoStack.push({
                audioId: state.audioId,
                operation: state.operation,
                buffer: currentBufferClone,
                metadata: { ...currentAudioData }
            });
        }

        // Restore redone state
        const newId = this.audioEngine.generateId();
        this.audioEngine.audioBuffers.set(newId, {
            buffer: state.buffer,
            name: state.metadata.name,
            duration: state.buffer.duration,
            sampleRate: state.buffer.sampleRate,
            channels: state.buffer.numberOfChannels
        });

        return newId;
    }

    /**
     * Check if undo is available
     * @returns {boolean} True if undo is available
     */
    canUndo() {
        return this.undoStack.length > 0;
    }

    /**
     * Check if redo is available
     * @returns {boolean} True if redo is available
     */
    canRedo() {
        return this.redoStack.length > 0;
    }

    /**
     * Clear undo/redo history
     */
    clearHistory() {
        this.undoStack = [];
        this.redoStack = [];
    }
}
