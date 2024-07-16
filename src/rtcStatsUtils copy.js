/**
 * @typedef {Object} RTCStatsConfig
 * @property {number} frameHeightTarget - Target frame height
 * @property {number} framerateTarget - Target framerate
 * @property {number} smoothnessTarget - Target smoothness percentage
 * @property {number} freezeTarget - Target freeze count (inverted)
 * @property {number} freezeDurationTarget - Target freeze duration (inverted)
 */

/**
 * @typedef {Object} TransformedStats
 * @property {string} clientId - Client identifier
 * @property {string} testId - Test identifier
 * @property {string} connectionId - Connection identifier
 * @property {number} reportNum - Report number
 * @property {Object.<string, Object>} stats - Transformed statistics
 */

/**
 * Configuration for RTC stats processing
 * @type {RTCStatsConfig}
 */
const config = {
    frameHeightTarget: 720,
    framerateTarget: 30,
    smoothnessTarget: 100,
    freezeTarget: 1,
    freezeDurationTarget: 1
};

/**
 * Types of RTC stats to process
 * @type {string[]}
 */
const TYPES_TO_KEEP = ["inbound-rtp", "outbound-rtp", "remote-inbound-rtp", "remote-outbound-rtp"];

/**
 * Kinds of media to process
 * @type {string[]}
 */
const KINDS_TO_KEEP = ["audio", "video"];

/**
 * SSRCs to exclude from processing
 * @type {number[]}
 */
const SSRC_TO_REMOVE = [1234];

const INBOUND_KEYS = [
    'frameHeight', 'framesDecoded', 'packetsReceived', 'bytesReceived',
    'jitter', 'packetsLost', 'totalDecodeTime', 'totalInterFrameDelay',
    'totalSquaredInterFrameDelay', 'nackCount', 'firCount', 'pliCount'
];

const OUTBOUND_KEYS = [
    'frameHeight', 'framesEncoded', 'packetsSent', 'bytesSent',
    'totalEncodeTime', 'totalPacketSendDelay', 'nackCount', 'firCount', 'pliCount'
];

/**
 * Keys to transform in RTC stats
 * @type {string[]}
 */
const KEYS_TO_TRANSFORM = [
    'id', 'timestamp', 'type', 'kind', 'ssrc', 'transportId', 'jitter', 'packetsLost',
    'packetsReceived', 'framesDecoded', 'freezeCount', 'freezeDuration', 'frameHeight',
    'bytesReceived', 'totalPausesDuration', 'totalFreezesDuration', 'framesSent',
    'framesEncoded', 'keyFramesDecoded', 'keyFramesEncoded', 'qpSum', 'totalSamplesReceived',
    'concealedSamples', 'silentConcealedSamples', 'insertedSamplesForDeceleration',
    'removedSamplesForAcceleration', 'audioLevel', 'totalAudioEnergy', 'totalSamplesDuration',
    'bytesSent', 'totalDecodeTime'
];

/**
 * Keys to keep in transformed stats
 * @type {string[]}
 */
const KEYS_TO_KEEP = [
    'id', 'timestamp', 'type', 'kind', 'ssrc', 'transportId', 'packetsReceivedPerSecond',
    'framesDecodedPerSecond', 'freezeCountPerSecond', 'bytesReceivedPerSecond', 'frameHeight', 'totalFreezesDurationPerSecond',
    'bytesSentPerSecond', 'bitsReceivedPerSecond', 'bitsSentPerSecond', 'framesSentPerSecond',
    'framesEncodedPerSecond', 'keyFramesDecodedPerSecond', 'keyFramesEncodedPerSecond',
    'qpSumPerSecond', 'jitterBufferEmittedCountPerSecond', 'samplesReceivedPerSecond',
    'concealedSamplesPerSecond', 'silentConcealedSamplesPerSecond', 'insertedSamplesForDecelerationPerSecond',
    'removedSamplesForAccelerationPerSecond', 'audioLevelPerSecond', 'totalAudioEnergyPerSecond',
    'samplesDurationPerSecond', 'frameHeightTargetPct', 'framerateTargetPct', 'smoothnessTargetPct',
    'freezeTargetPct', 'freezeDurationTargetPct'
];

/**
 * Keys representing cumulative values
 * @type {string[]}
 */
const CUMULATIVE_KEYS = [
    'packetsReceived', 'framesDecoded', 'freezeCount', 'freezeDuration', 'bytesReceived',
    'totalPausesDuration', 'totalFreezesDuration', 'framesSent', 'framesEncoded',
    'keyFramesDecoded', 'keyFramesEncoded', 'qpSum', 'totalSamplesReceived', 'concealedSamples',
    'silentConcealedSamples', 'insertedSamplesForDeceleration', 'removedSamplesForAcceleration',
    'audioLevel', 'totalAudioEnergy', 'totalSamplesDuration', 'bytesSent', 'totalDecodeTime'
];

/**
 * Queue to handle spreading freeze durations
 * @type {Object.<string, {remainingDuration: number, remainingPeriods: number}>}
 */
const freezeQueue = {};

/**
 * Object to store transformed metrics per period
 * @type {{inboundData: Array, outboundData: Array}}
 */
let periods = [];

/**
 * Sorts periods by timestamp
 * @param {TransformedStats[]} periods - Array of periods to sort
 * @returns {TransformedStats[]} Sorted periods
 */
function sortPeriodsByTimestamp(periods) {
    return periods.sort((a, b) => {
        const aTimestamp = Object.values(a).find(v => v && v.timestamp)?.timestamp || 0;
        const bTimestamp = Object.values(b).find(v => v && v.timestamp)?.timestamp || 0;
        return aTimestamp - bTimestamp;
    });
}

/**
 * Splits raw data into inbound and outbound peer connections
 * @param {Object[]} rawData - Raw RTC stats data
 * @returns {{inboundData: TransformedStats[], outboundData: TransformedStats[]}} Split peer connections
 */
function splitPeerConnections(rawData) {
    const inboundData = [];
    const outboundData = [];

    rawData.forEach(period => {
        let hasInbound = false;
        let hasOutbound = false;

        for (const value of Object.values(period)) {
            if (typeof value === 'object' && value !== null) {
                if (value.type === 'inbound-rtp') {
                    hasInbound = true;
                } else if (value.type === 'outbound-rtp') {
                    hasOutbound = true;
                }
            }
        }

        if (hasInbound) inboundData.push(period);
        if (hasOutbound) outboundData.push(period);
    });

    return {
        inboundData: sortPeriodsByTimestamp(inboundData),
        outboundData: sortPeriodsByTimestamp(outboundData),
    };
}

/**
 * Filters object keys based on a whitelist
 * @param {Object} data - Object to filter
 * @param {string[]} keysToKeep - Array of keys to keep
 * @returns {Object} Filtered object
 */
function filterKeys(data, keysToKeep) {
    return Object.fromEntries(
        Object.entries(data).map(([key, value]) => [
            key,
            typeof value === 'object' && value !== null
                ? Object.fromEntries(Object.entries(value).filter(([k]) => keysToKeep.includes(k)))
                : keysToKeep.includes(key) ? value : undefined
        ]).filter(([, value]) => value !== undefined)
    );
}

/**
 * Distributes freeze duration across periods
 * @param {string} id - Stat identifier
 * @param {string} key - Stat key
 * @param {TransformedStats} transformedData - Transformed stats object
 */
function distributeFreezeDuration(id, key, transformedData) {
    if (!freezeQueue[id]) {
        freezeQueue[id] = { remainingDuration: 0, remainingPeriods: 0 };
    }
    if (freezeQueue[id].remainingPeriods > 0) {
        const durationToDistribute = Math.min(freezeQueue[id].remainingDuration, 1);
        transformedData[key].totalFreezesDurationPerSecond = durationToDistribute;
        freezeQueue[id].remainingDuration -= durationToDistribute;
        freezeQueue[id].remainingPeriods -= 1;
    }
}

/**
 * Calculates target percentages for various metrics
 * @param {TransformedStats} transformedData - Transformed stats object
 */

/*
function calculateTargets(transformedData) {
    if ('frameHeight' in transformedData) {
        transformedData.frameHeightTargetPct = (transformedData.frameHeight / config.frameHeightTarget) * 100;
    }
    if ('framesDecodedPerSecond' in transformedData) {
        transformedData.framerateTargetPct = (transformedData.framesDecodedPerSecond / config.framerateTarget) * 100;
    }
    if ('framesDecodedPerSecond' in transformedData && 'previousFramesDecodedPerSecond' in transformedData) {
        const smoothness = Math.abs(transformedData.framesDecodedPerSecond - transformedData.previousFramesDecodedPerSecond) >= 2 ? 0 : 100;
        transformedData.smoothnessTargetPct = smoothness;
    }
    if ('freezeCountPerSecond' in transformedData) {
        transformedData.freezeTargetPct = (1 - transformedData.freezeCountPerSecond) * 100;
    }
    if ('totalFreezesDurationPerSecond' in transformedData) {
        transformedData.freezeDurationTargetPct = (1 - transformedData.totalFreezesDurationPerSecond) * 100;
    }*/

function calculateTargets(transformedData) {
    if ('frameHeight' in transformedData) {
        transformedData.frameHeightTargetPct = (transformedData.frameHeight / config.frameHeightTarget) * 100;
    }
    if (transformedData.type.includes('inbound') && 'framesDecodedPerSecond' in transformedData) {
        transformedData.framerateTargetPct = (transformedData.framesDecodedPerSecond / config.framerateTarget) * 100;
    } else if (transformedData.type.includes('outbound') && 'framesEncodedPerSecond' in transformedData) {
        transformedData.framerateTargetPct = (transformedData.framesEncodedPerSecond / config.framerateTarget) * 100;
    }
    // Add other target calculations as needed
}

/**
 * Transforms a single period of RTC stats
 * @param {Object} period - Raw period data
 * @param {Object} previousTransformedData - Previously transformed data
 * @returns {TransformedStats} Transformed stats
 */
function transformPeriod(value, previousData) {
    const { timestamp, id, type } = value;
    const transformedData = { id, timestamp, type };

    // Determine if it's inbound or outbound
    const isInbound = type.includes('inbound');
    const relevantKeys = isInbound ? INBOUND_KEYS : OUTBOUND_KEYS;

    for (const key of relevantKeys) {
        if (key in value) {
            transformedData[key] = value[key];
        }
    }

    if (previousData && previousData.timestamp) {
        const timeDiff = (timestamp - previousData.timestamp) / 1000;
        if (timeDiff > 0) {
            for (const key of CUMULATIVE_KEYS) {
                if (key in value && key in previousData) {
                    const previousValue = previousData[key] || 0;
                    const currentValue = value[key];
                    const diffValue = currentValue - previousValue;
                    const perSecondValue = diffValue / timeDiff;
                    transformedData[`${key}PerSecond`] = perSecondValue;
                }
            }
        }
    }

    calculateTargets(transformedData);

    return transformedData;
}

/**
 * Transforms raw RTC stats into a more usable format
 * @param {Object[]} rawData - Raw RTC stats data
 * @param {Object} previousTransformedData - Previously transformed data
 * @returns {{inboundData: TransformedStats[], outboundData: TransformedStats[]}} Transformed stats
 */
export function transformStats(rawData, previousTransformedData) {
    const transformedData = {};

    for (const period of rawData) {
        for (const [key, value] of Object.entries(period)) {
            if (typeof value === 'object' && value !== null && 'id' in value) {
                const { type, kind, ssrc } = value;
                if (TYPES_TO_KEEP.includes(type) && KINDS_TO_KEEP.includes(kind) && !SSRC_TO_REMOVE.includes(ssrc)) {
                    const id = value.id;
                    if (!transformedData[id]) {
                        transformedData[id] = { id, periods: [] };
                    }
                    const transformedPeriod = transformPeriod(value, previousTransformedData[id]);
                    if (transformedPeriod) {
                        transformedData[id].periods.push(transformedPeriod);

                        // Update previousTransformedData
                        previousTransformedData[id] = transformedPeriod;
                    }
                }
            }
        }
    }

    return Object.values(transformedData);
}

/**
 * Stores a transformed period
 * @param {{inboundData: Array, outboundData: Array}} transformedData 
 */
export function storePeriod(transformedData) {
    for (const userData of transformedData) {
        const existingUserIndex = periods.findIndex(p => p.id === userData.id);
        if (existingUserIndex !== -1) {
            periods[existingUserIndex].periods.push(...userData.periods);
        } else {
            periods.push({ ...userData });
        }
    }
}


/**
 * Logs transformed data
 * @param {TransformedStats[]} transformedDataArray - Array of transformed stats
 */
export function logTransformedData(transformedDataArray) {
    console.info("[RTCStats] Transformed data:", transformedDataArray);
}

/**
 * Logs stored periods
 */
export function logStoredPeriods() {
    console.info("[RTCStats] Stored periods:", periods);
}

/**
 * Calculates average metrics from stored periods
 * @returns {{averageResolution: number, averageFramerate: number, averageFreezeCount: number, averageFreezeDuration: number}}
 */

function calculateAverageMetrics() {
    return periods.map(userData => {
        const metrics = {
            resolutions: [],
            framerates: [],
            freezeCounts: [],
            freezeDurations: []
        };

        userData.periods.forEach(period => {
            if ('frameHeight' in period) metrics.resolutions.push(period.frameHeight || 0);
            if ('framesDecodedPerSecond' in period) metrics.framerates.push(period.framesDecodedPerSecond || 0);
            if ('freezeCountPerSecond' in period) metrics.freezeCounts.push(period.freezeCountPerSecond || 0);
            if ('totalFreezesDurationPerSecond' in period) metrics.freezeDurations.push(period.totalFreezesDurationPerSecond || 0);
        });

        const calculateAverage = (arr) => arr.length > 0 ? arr.reduce((acc, val) => acc + val, 0) / arr.length : 0;

        return {
            id: userData.id,
            averageResolution: calculateAverage(metrics.resolutions),
            averageFramerate: calculateAverage(metrics.framerates),
            averageFreezeCount: calculateAverage(metrics.freezeCounts),
            averageFreezeDuration: calculateAverage(metrics.freezeDurations)
        };
    });
}

function calculateTargetPctMet() {
    return calculateAverageMetrics().map(userData => ({
        ...userData,
        resolutionTargetPctMet: (userData.averageResolution / config.frameHeightTarget) * 100,
        smoothnessTargetPctMet: (userData.averageFramerate / config.framerateTarget) * 100,
        freezeCountTargetPctMet: (1 - userData.averageFreezeCount) * 100,
        freezeDurationTargetPctMet: (1 - userData.averageFreezeDuration) * 100,
    }));
}

/**
 * Calculates aggregated stats
 * @returns {Object} Aggregated stats
 */
export function calculateAggregatedStats() {
    return calculateTargetPctMet();
}

/**
 * Logs aggregated stats
 */
export function logAggregatedStats() {
    const aggregatedStats = calculateAggregatedStats();
    console.info("[RTCStats] Aggregated stats:", aggregatedStats);
}

/**
 * Provider interface for different WebRTC implementations
 * @interface
 */
class RTCStatsProvider {
    /**
     * Transform raw stats data
     * @param {Object[]} rawData - Raw stats data
     * @param {Object} previousTransformedData - Previously transformed data
     * @returns {{inboundData: TransformedStats[], outboundData: TransformedStats[]}} Transformed stats
     */
    transformStats(rawData, previousTransformedData) {
        throw new Error('Method not implemented');
    }
}

/**
 * Daily provider implementation
 */
class DailyProvider extends RTCStatsProvider {
    transformStats(rawData, previousTransformedData) {
        // Existing implementation for Daily
        return transformStats(rawData, previousTransformedData);
    }
}

/**
 * Twilio provider implementation (placeholder)
 */
class TwilioProvider extends RTCStatsProvider {
    transformStats(rawData, previousTransformedData) {
        // TODO: Implement Twilio-specific transformation logic
        throw new Error('Twilio transformation not yet implemented');
    }
}

/**
 * Factory function to create the appropriate provider
 * @param {string} providerName - Name of the provider
 * @returns {RTCStatsProvider} Provider instance
 */
export function createProvider(providerName) {
    switch (providerName.toLowerCase()) {
        case 'daily':
            return new DailyProvider();
        case 'twilio':
            return new TwilioProvider();
        default:
            throw new Error(`Unknown provider: ${providerName}`);
    }
}