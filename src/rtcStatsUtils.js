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
    freezeTarget: 1, // Inverted so we don't divide by 0. We also invert the actual freeze duration per second
    freezeDurationTarget: 1 // Inverted so we don't divide by 0. We also invert the actual freeze duration per second
};

/**
 * Types of RTC stats to process
 * @type {string[]}
 */
const TYPES_TO_KEEP = [
    "inbound-rtp",
    //"outbound-rtp", 
    //"remote-inbound-rtp", 
    //"remote-outbound-rtp"
];

/**
 * Kinds of media to process
 * @type {string[]}
 */
const KINDS_TO_KEEP = [
    //"audio", 
    "video"
];

/**
 * SSRCs to exclude from processing
 * @type {number[]}
 */
const SSRC_TO_REMOVE = [1234];

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
 * @type {{inboundPC: Array, outboundPC: Array}}
 */
let periods = { inboundPC: [], outboundPC: [] };

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
 * @returns {{inboundPC: TransformedStats[], outboundPC: TransformedStats[]}} Split peer connections
 */
function splitPeerConnections(rawData) {
    const inboundPC = [];
    const outboundPC = [];

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

        if (hasInbound) inboundPC.push(period);
        if (hasOutbound) outboundPC.push(period);
    });

    return {
        inboundPC: sortPeriodsByTimestamp(inboundPC),
        outboundPC: sortPeriodsByTimestamp(outboundPC),
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
function calculateTargets(transformedData) {
    for (const value of Object.values(transformedData)) {
        if (typeof value === 'object' && value !== null) {
            if ('frameHeight' in value) {
                value.frameHeightTargetPct = (value.frameHeight / config.frameHeightTarget) * 100;
            }
            if ('framesDecodedPerSecond' in value) {
                value.framerateTargetPct = (value.framesDecodedPerSecond / config.framerateTarget) * 100;
            }
            if ('framesDecodedPerSecond' in value && 'previousFramesDecodedPerSecond' in value) {
                const smoothness = Math.abs(value.framesDecodedPerSecond - value.previousFramesDecodedPerSecond) >= 2 ? 0 : 100; // Return here to adjust smoothness calculation
                value.smoothnessTargetPct = smoothness;
            }
            if ('freezeCountPerSecond' in value) {
                value.freezeTargetPct = (1 - value.freezeCountPerSecond) * 100;
            }
            if ('totalFreezesDurationPerSecond' in value) {
                value.freezeDurationTargetPct = (1 - value.totalFreezesDurationPerSecond) * 100;
            }
        }
    }
}

/**
 * Transforms a single period of RTC stats
 * @param {Object} period - Raw period data
 * @param {Object} previousTransformedData - Previously transformed data
 * @returns {TransformedStats} Transformed stats
 */
function transformPeriod(period, previousTransformedData) {
    const transformedData = {
        clientId: period.clientId,
        testId: period.testId,
        connectionId: period.connectionId,
        reportNum: period.reportNum,
    };

    for (const [key, value] of Object.entries(period)) {
        if (typeof value === 'object' && value !== null) {
            const { type, kind, ssrc, timestamp, id } = value;
            if (TYPES_TO_KEEP.includes(type) && KINDS_TO_KEEP.includes(kind) && !SSRC_TO_REMOVE.includes(ssrc)) {
                transformedData[key] = {};
                for (const innerKey of KEYS_TO_TRANSFORM) {
                    if (innerKey in value) {
                        transformedData[key][innerKey] = value[innerKey];
                    }
                }

                const previousData = previousTransformedData[id];

                if (previousData && previousData[key] && previousData[key].id === id) {
                    const timeDiff = (timestamp - previousData[key].timestamp) / 1000;

                    if (timeDiff > 0) {
                        const percentOfSecs = 1 / timeDiff;
                        for (const innerKey of CUMULATIVE_KEYS) {
                            if (innerKey in value) {
                                const previousValue = previousData[key][innerKey] || 0;
                                const currentValue = value[innerKey];
                                const diffValue = currentValue - previousValue;
                                const perSecondValue = diffValue * percentOfSecs;

                                if (innerKey === 'totalFreezesDuration') {
                                    const freezeDurationDiff = currentValue - previousValue;
                                    if (freezeDurationDiff > 1) {
                                        freezeQueue[id] = {
                                            remainingDuration: freezeDurationDiff,
                                            remainingPeriods: Math.ceil(freezeDurationDiff),
                                        };
                                        distributeFreezeDuration(id, key, transformedData);
                                    } else {
                                        transformedData[key][`${innerKey}PerSecond`] = perSecondValue;
                                    }
                                } else {
                                    transformedData[key][`${innerKey}PerSecond`] = perSecondValue;
                                }
                            }
                        }
                    } else {
                        for (const innerKey of CUMULATIVE_KEYS) {
                            const perSecondKey = `${innerKey}PerSecond`;
                            if (perSecondKey in previousData[key]) {
                                transformedData[key][perSecondKey] = previousData[key][perSecondKey];
                            }
                        }
                    }
                } else {
                    for (const innerKey of CUMULATIVE_KEYS) {
                        if (innerKey in value) {
                            transformedData[key][`${innerKey}PerSecond`] = value[innerKey];
                        }
                    }
                }

                distributeFreezeDuration(id, key, transformedData);
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
 * @returns {{inboundPC: TransformedStats[], outboundPC: TransformedStats[]}} Transformed stats
 */
export function transformStats(rawData, previousTransformedData) {
    const { inboundPC, outboundPC } = splitPeerConnections(rawData);
    const transformedInboundPC = [];
    const transformedOutboundPC = [];

    for (const period of inboundPC) {
        const transformedData = transformPeriod(period, previousTransformedData);
        transformedInboundPC.push(transformedData);
        for (const [key, value] of Object.entries(transformedData)) {
            if (value.id) {
                previousTransformedData[value.id] = { ...value, ...previousTransformedData[value.id], [key]: value };
            }
        }
    }

    for (const period of outboundPC) {
        const transformedData = transformPeriod(period, previousTransformedData);
        transformedOutboundPC.push(transformedData);
        for (const [key, value] of Object.entries(transformedData)) {
            if (value.id) {
                previousTransformedData[value.id] = { ...value, ...previousTransformedData[value.id], [key]: value };
            }
        }
    }

    return {
        inboundPC: transformedInboundPC.map(data => filterKeys(data, KEYS_TO_KEEP)),
        outboundPC: transformedOutboundPC.map(data => filterKeys(data, KEYS_TO_KEEP))
    };
}

/**
 * Stores a transformed period
 * @param {{inboundPC: Array, outboundPC: Array}} transformedData 
 */
export function storePeriod(transformedData) {
    periods.inboundPC.push(...transformedData.inboundPC);
    periods.outboundPC.push(...transformedData.outboundPC);
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
    const metrics = {
        resolutions: [],
        framerates: [],
        freezeCounts: [],
        freezeDurations: []
    };

    const processMetrics = (period) => {
        Object.values(period).forEach(value => {
            if (typeof value === 'object' && value !== null) {
                if ('frameHeight' in value) metrics.resolutions.push(value.frameHeight || 0);
                if ('framesDecodedPerSecond' in value) metrics.framerates.push(value.framesDecodedPerSecond || 0);
                if ('freezeCountPerSecond' in value) metrics.freezeCounts.push(value.freezeCountPerSecond || 0);
                if ('totalFreezesDurationPerSecond' in value) metrics.freezeDurations.push(value.totalFreezesDurationPerSecond || 0);
            }
        });
    };

    periods.inboundPC.forEach(processMetrics);
    periods.outboundPC.forEach(processMetrics);

    const calculateAverage = (arr) => arr.length > 0 ? arr.reduce((acc, val) => acc + val, 0) / arr.length : 0;

    return {
        averageResolution: calculateAverage(metrics.resolutions),
        averageFramerate: calculateAverage(metrics.framerates),
        averageFreezeCount: calculateAverage(metrics.freezeCounts),
        averageFreezeDuration: calculateAverage(metrics.freezeDurations)
    };
}

/**
 * Calculates target percentage met for various metrics
 * @returns {{resolutionTargetPctMet: number, smoothnessTargetPctMet: number, freezeCountTargetPctMet: number, freezeDurationTargetPctMet: number}}
 */
function calculateTargetPctMet() {
    const { averageResolution, averageFramerate, averageFreezeCount, averageFreezeDuration } = calculateAverageMetrics();
    return {
        resolutionTargetPctMet: (averageResolution / config.frameHeightTarget) * 100,
        smoothnessTargetPctMet: (averageFramerate / config.framerateTarget) * 100,
        freezeCountTargetPctMet: (1 - averageFreezeCount) * 100,
        freezeDurationTargetPctMet: (1 - averageFreezeDuration) * 100,
    };
}

/**
 * Calculates aggregated stats
 * @returns {Object} Aggregated stats
 */
export function calculateAggregatedStats() {
    return {
        ...calculateAverageMetrics(),
        ...calculateTargetPctMet(),
        // Add more calculated stats as needed
    };
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
     * @returns {{inboundPC: TransformedStats[], outboundPC: TransformedStats[]}} Transformed stats
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