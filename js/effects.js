/**
 * Effects Processor - Audio effects processing chain
 * Supports EQ, Reverb, Delay, Compressor, Filter, and Distortion
 */

class EffectsProcessor {
    constructor(audioContext) {
        this.audioContext = audioContext;
        this.effects = new Map();
        this.masterGain = null;
        this.inputNode = null;
        this.outputNode = null;
        this.initialized = false;
    }

    /**
     * Initialize the effects chain
     */
    initialize() {
        if (this.initialized) return;

        // Create input node
        this.inputNode = this.audioContext.createGain();

        // Create master gain
        this.masterGain = this.audioContext.createGain();
        this.masterGain.gain.value = 1.0;

        // Initialize all effects
        this.initEqualizer();
        this.initReverb();
        this.initDelay();
        this.initCompressor();
        this.initFilter();
        this.initDistortion();

        // Connect chain: input -> effects -> master gain -> output
        this.reconnectChain();
        this.initialized = true;
    }

    /**
     * Reconnect the effects chain based on enabled effects
     */
    reconnectChain() {
        if (!this.inputNode || !this.masterGain) return;

        // Disconnect all
        this.inputNode.disconnect();
        this.masterGain.disconnect();

        // Build chain
        let currentNode = this.inputNode;

        // Add effects in order
        const effectOrder = ['filter', 'eq', 'distortion', 'delay', 'reverb', 'compressor'];

        for (const effectName of effectOrder) {
            const effect = this.effects.get(effectName);
            if (effect && effect.enabled) {
                currentNode.connect(effect.input);
                currentNode = effect.output;
            }
        }

        // Connect to master gain
        currentNode.connect(this.masterGain);
        this.masterGain.connect(this.audioContext.destination);

        this.outputNode = this.masterGain;
    }

    /**
     * Initialize equalizer
     */
    initEqualizer() {
        const bands = ['low', 'midlow', 'mid', 'midhigh', 'high'];
        const frequencies = [100, 400, 1000, 2500, 8000];
        const types = ['lowshelf', 'peaking', 'peaking', 'peaking', 'highshelf'];

        const filters = {};
        const input = this.audioContext.createGain();
        const output = this.audioContext.createGain();

        let currentNode = input;

        for (let i = 0; i < bands.length; i++) {
            const filter = this.audioContext.createBiquadFilter();
            filter.type = types[i];
            filter.frequency.value = frequencies[i];
            filter.gain.value = 0;
            filter.Q.value = 1.0;

            currentNode.connect(filter);
            currentNode = filter;

            filters[bands[i]] = filter;
        }

        currentNode.connect(output);

        this.effects.set('eq', {
            input,
            output,
            filters,
            enabled: false,
            type: 'eq'
        });
    }

    /**
     * Initialize reverb
     */
    initReverb() {
        const input = this.audioContext.createGain();
        const output = this.audioContext.createGain();
        const wetGain = this.audioContext.createGain();
        const dryGain = this.audioContext.createGain();
        const convolver = this.audioContext.createConvolver();
        const decayGain = this.audioContext.createGain();

        // Create impulse response for reverb
        const impulseResponse = this.createImpulseResponse(2, 2, false);
        convolver.buffer = impulseResponse;

        // Connect nodes
        input.connect(dryGain);
        dryGain.connect(output);

        input.connect(convolver);
        convolver.connect(decayGain);
        decayGain.connect(wetGain);
        wetGain.connect(output);

        // Set default values
        wetGain.gain.value = 0.3;
        dryGain.gain.value = 0.7;
        decayGain.gain.value = 1.0;

        this.effects.set('reverb', {
            input,
            output,
            convolver,
            wetGain,
            dryGain,
            decayGain,
            mix: 30,
            decay: 2.0,
            enabled: false,
            type: 'reverb'
        });
    }

    /**
     * Initialize delay
     */
    initDelay() {
        const input = this.audioContext.createGain();
        const output = this.audioContext.createGain();
        const delayNode = this.audioContext.createDelay(2);
        const feedback = this.audioContext.createGain();
        const wetGain = this.audioContext.createGain();
        const dryGain = this.audioContext.createGain();

        // Connect nodes
        input.connect(dryGain);
        dryGain.connect(output);

        input.connect(delayNode);
        delayNode.connect(feedback);
        feedback.connect(delayNode);
        delayNode.connect(wetGain);
        wetGain.connect(output);

        // Set default values
        delayNode.delayTime.value = 0.3;
        feedback.gain.value = 0.3;
        wetGain.gain.value = 0.2;
        dryGain.gain.value = 0.8;

        this.effects.set('delay', {
            input,
            output,
            delayNode,
            feedback,
            wetGain,
            dryGain,
            time: 300,
            feedbackAmount: 30,
            mix: 20,
            enabled: false,
            type: 'delay'
        });
    }

    /**
     * Initialize compressor
     */
    initCompressor() {
        const input = this.audioContext.createGain();
        const output = this.audioContext.createGain();
        const compressor = this.audioContext.createDynamicsCompressor();

        // Set default values
        compressor.threshold.value = -24;
        compressor.knee.value = 30;
        compressor.ratio.value = 4;
        compressor.attack.value = 0.01;
        compressor.release.value = 0.1;

        // Connect nodes
        input.connect(compressor);
        compressor.connect(output);

        this.effects.set('compressor', {
            input,
            output,
            compressor,
            threshold: -24,
            ratio: 4,
            attack: 10,
            release: 100,
            enabled: false,
            type: 'compressor'
        });
    }

    /**
     * Initialize filter
     */
    initFilter() {
        const input = this.audioContext.createGain();
        const output = this.audioContext.createGain();
        const filter = this.audioContext.createBiquadFilter();

        // Set default values
        filter.type = 'lowpass';
        filter.frequency.value = 1000;
        filter.Q.value = 1.0;

        // Connect nodes
        input.connect(filter);
        filter.connect(output);

        this.effects.set('filter', {
            input,
            output,
            filter,
            type: 'lowpass',
            frequency: 1000,
            q: 1.0,
            enabled: false,
            filterType: 'filter'
        });
    }

    /**
     * Initialize distortion
     */
    initDistortion() {
        const input = this.audioContext.createGain();
        const output = this.audioContext.createGain();
        const shaper = this.audioContext.createWaveShaper();
        const wetGain = this.audioContext.createGain();
        const dryGain = this.audioContext.createGain();

        // Create distortion curve
        shaper.curve = this.makeDistortionCurve(20);
        shaper.oversample = '4x';

        // Connect nodes
        input.connect(dryGain);
        dryGain.connect(output);

        input.connect(shaper);
        shaper.connect(wetGain);
        wetGain.connect(output);

        // Set default values
        wetGain.gain.value = 0.5;
        dryGain.gain.value = 0.5;

        this.effects.set('distortion', {
            input,
            output,
            shaper,
            wetGain,
            dryGain,
            drive: 20,
            mix: 50,
            enabled: false,
            type: 'distortion'
        });
    }

    /**
     * Create impulse response for reverb
     * @param {number} duration - Duration in seconds
     * @param {number} decay - Decay factor
     * @param {boolean} reverse - Reverse impulse
     * @returns {AudioBuffer} Impulse response buffer
     */
    createImpulseResponse(duration, decay, reverse) {
        const sampleRate = this.audioContext.sampleRate;
        const length = sampleRate * duration;
        const impulse = this.audioContext.createBuffer(2, length, sampleRate);
        const left = impulse.getChannelData(0);
        const right = impulse.getChannelData(1);

        for (let i = 0; i < length; i++) {
            const n = reverse ? length - i : i;
            let value = (Math.random() * 2 - 1) * Math.pow(1 - n / length, decay);
            left[i] = value;
            right[i] = value;
        }

        return impulse;
    }

    /**
     * Create distortion curve
     * @param {number} amount - Distortion amount (0-100)
     * @returns {Float32Array} Distortion curve
     */
    makeDistortionCurve(amount) {
        const samples = 44100;
        const curve = new Float32Array(samples);
        const deg = Math.PI / 180;

        for (let i = 0; i < samples; i++) {
            const x = (i * 2) / samples - 1;
            curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
        }

        return curve;
    }

    /**
     * Enable or disable an effect
     * @param {string} effectName - Name of the effect
     * @param {boolean} enabled - Enable state
     */
    setEffectEnabled(effectName, enabled) {
        const effect = this.effects.get(effectName);
        if (effect) {
            effect.enabled = enabled;
            this.reconnectChain();
        }
    }

    /**
     * Set equalizer band gain
     * @param {string} band - Band name (low, midlow, mid, midhigh, high)
     * @param {number} gain - Gain in dB (-12 to 12)
     */
    setEQGain(band, gain) {
        const eq = this.effects.get('eq');
        if (eq && eq.filters[band]) {
            eq.filters[band].gain.value = Math.max(-12, Math.min(12, gain));
        }
    }

    /**
     * Set reverb parameters
     * @param {number} mix - Mix amount (0-100)
     * @param {number} decay - Decay time (0.1-10s)
     */
    setReverb(mix, decay) {
        const reverb = this.effects.get('reverb');
        if (reverb) {
            reverb.mix = mix;
            reverb.decay = decay;

            const wetLevel = mix / 100;
            const dryLevel = 1 - wetLevel;

            reverb.wetGain.gain.value = wetLevel;
            reverb.dryGain.gain.value = dryLevel;

            // Update impulse response
            reverb.convolver.buffer = this.createImpulseResponse(decay, 2, false);
        }
    }

    /**
     * Set delay parameters
     * @param {number} time - Delay time in ms (0-1000)
     * @param {number} feedback - Feedback amount (0-90)
     * @param {number} mix - Mix amount (0-100)
     */
    setDelay(time, feedback, mix) {
        const delay = this.effects.get('delay');
        if (delay) {
            delay.time = time;
            delay.feedbackAmount = feedback;
            delay.mix = mix;

            delay.delayNode.delayTime.value = time / 1000;
            delay.feedback.gain.value = feedback / 100;

            const wetLevel = mix / 100;
            const dryLevel = 1 - wetLevel;
            delay.wetGain.gain.value = wetLevel;
            delay.dryGain.gain.value = dryLevel;
        }
    }

    /**
     * Set compressor parameters
     * @param {number} threshold - Threshold in dB (-60 to 0)
     * @param {number} ratio - Ratio (1-20)
     * @param {number} attack - Attack time in ms (0-1000)
     * @param {number} release - Release time in ms (10-1000)
     */
    setCompressor(threshold, ratio, attack, release) {
        const compressor = this.effects.get('compressor');
        if (compressor) {
            compressor.threshold = threshold;
            compressor.ratio = ratio;
            compressor.attack = attack;
            compressor.release = release;

            compressor.compressor.threshold.value = threshold;
            compressor.compressor.ratio.value = ratio;
            compressor.compressor.attack.value = attack / 1000;
            compressor.compressor.release.value = release / 1000;
        }
    }

    /**
     * Set filter parameters
     * @param {string} type - Filter type (lowpass, highpass, bandpass, notch)
     * @param {number} frequency - Frequency in Hz (20-20000)
     * @param {number} q - Q value (0.1-20)
     */
    setFilter(type, frequency, q) {
        const filter = this.effects.get('filter');
        if (filter) {
            filter.type = type;
            filter.frequency = frequency;
            filter.q = q;

            filter.filter.type = type;
            filter.filter.frequency.value = frequency;
            filter.filter.Q.value = q;
        }
    }

    /**
     * Set distortion parameters
     * @param {number} drive - Drive amount (0-100)
     * @param {number} mix - Mix amount (0-100)
     */
    setDistortion(drive, mix) {
        const distortion = this.effects.get('distortion');
        if (distortion) {
            distortion.drive = drive;
            distortion.mix = mix;

            distortion.shaper.curve = this.makeDistortionCurve(drive);

            const wetLevel = mix / 100;
            const dryLevel = 1 - wetLevel;
            distortion.wetGain.gain.value = wetLevel;
            distortion.dryGain.gain.value = dryLevel;
        }
    }

    /**
     * Connect source to effects chain
     * @param {AudioNode} sourceNode - Source audio node
     */
    connect(sourceNode) {
        if (!this.initialized) {
            this.initialize();
        }
        sourceNode.connect(this.inputNode);
    }

    /**
     * Connect output from effects chain
     * @param {AudioNode} destinationNode - Destination audio node
     */
    connectOutput(destinationNode) {
        if (this.outputNode) {
            this.outputNode.disconnect();
            this.outputNode.connect(destinationNode);
        }
    }

    /**
     * Set master output gain
     * @param {number} gain - Gain value (0-1)
     */
    setMasterGain(gain) {
        if (this.masterGain) {
            this.masterGain.gain.value = Math.max(0, Math.min(1, gain));
        }
    }

    /**
     * Get effect state
     * @param {string} effectName - Name of the effect
     * @returns {Object|null} Effect state object
     */
    getEffectState(effectName) {
        return this.effects.get(effectName) || null;
    }

    /**
     * Check if effect is enabled
     * @param {string} effectName - Name of the effect
     * @returns {boolean} true if enabled
     */
    isEffectEnabled(effectName) {
        const effect = this.effects.get(effectName);
        return effect ? effect.enabled : false;
    }

    /**
     * Reset all effects to default values
     */
    resetAll() {
        // Reset EQ
        const bands = ['low', 'midlow', 'mid', 'midhigh', 'high'];
        for (const band of bands) {
            this.setEQGain(band, 0);
        }

        // Reset reverb
        this.setReverb(30, 2.0);

        // Reset delay
        this.setDelay(300, 30, 20);

        // Reset compressor
        this.setCompressor(-24, 4, 10, 100);

        // Reset filter
        this.setFilter('lowpass', 1000, 1.0);

        // Reset distortion
        this.setDistortion(20, 50);

        // Disable all effects
        for (const [name] of this.effects) {
            this.setEffectEnabled(name, false);
        }
    }

    /**
     * Get effect settings as object for export
     * @returns {Object} Settings object
     */
    getSettings() {
        const settings = {};

        for (const [name, effect] of this.effects) {
            settings[name] = {
                enabled: effect.enabled
            };

            // Add effect-specific settings
            if (name === 'eq') {
                for (const [band, filter] of Object.entries(effect.filters)) {
                    settings[name][band] = filter.gain.value;
                }
            } else if (name === 'reverb') {
                settings[name].mix = effect.mix;
                settings[name].decay = effect.decay;
            } else if (name === 'delay') {
                settings[name].time = effect.time;
                settings[name].feedback = effect.feedbackAmount;
                settings[name].mix = effect.mix;
            } else if (name === 'compressor') {
                settings[name].threshold = effect.threshold;
                settings[name].ratio = effect.ratio;
                settings[name].attack = effect.attack;
                settings[name].release = effect.release;
            } else if (name === 'filter') {
                settings[name].type = effect.type;
                settings[name].frequency = effect.frequency;
                settings[name].q = effect.q;
            } else if (name === 'distortion') {
                settings[name].drive = effect.drive;
                settings[name].mix = effect.mix;
            }
        }

        return settings;
    }

    /**
     * Load effect settings from object
     * @param {Object} settings - Settings object
     */
    loadSettings(settings) {
        for (const [name, effectSettings] of Object.entries(settings)) {
            const effect = this.effects.get(name);
            if (!effect) continue;

            // Set enabled state
            this.setEffectEnabled(name, effectSettings.enabled);

            // Apply effect-specific settings
            if (name === 'eq') {
                for (const [band, gain] of Object.entries(effectSettings)) {
                    if (band !== 'enabled') {
                        this.setEQGain(band, gain);
                    }
                }
            } else if (name === 'reverb') {
                this.setReverb(effectSettings.mix, effectSettings.decay);
            } else if (name === 'delay') {
                this.setDelay(effectSettings.time, effectSettings.feedback, effectSettings.mix);
            } else if (name === 'compressor') {
                this.setCompressor(
                    effectSettings.threshold,
                    effectSettings.ratio,
                    effectSettings.attack,
                    effectSettings.release
                );
            } else if (name === 'filter') {
                this.setFilter(effectSettings.type, effectSettings.frequency, effectSettings.q);
            } else if (name === 'distortion') {
                this.setDistortion(effectSettings.drive, effectSettings.mix);
            }
        }
    }

    /**
     * Clean up resources
     */
    dispose() {
        if (this.inputNode) {
            this.inputNode.disconnect();
        }
        if (this.masterGain) {
            this.masterGain.disconnect();
        }
        this.effects.clear();
        this.initialized = false;
    }
}
