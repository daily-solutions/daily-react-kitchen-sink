const periods = { inboundPC: [], outboundPC: [] }; // Array to store transformed metrics per period

const typesToKeep = ["inbound-rtp", "outbound-rtp", "remote-inbound-rtp", "remote-outbound-rtp"];
const kindsToKeep = ["audio", "video"];
const ssrcToRemove = [1234];

const frameHeightTarget = 720;
const framerateTarget = 30;
const smoothnessTarget = 100;
const freezeTarget = 1; // Target for flipped freeze values
const freezeDurationTarget = 1; // Target for flipped freeze duration values

const keysToTransform = [
    'id', 'timestamp', 'type', 'kind', 'ssrc', 'transportId', 'jitter', 'packetsLost',
    'packetsReceived', 'framesDecoded', 'freezeCount', 'freezeDuration', 'frameHeight',
    'bytesReceived', 'totalPausesDuration', 'totalFreezesDuration', 'framesSent',
    'framesEncoded', 'keyFramesDecoded', 'keyFramesEncoded', 'qpSum', 'totalSamplesReceived',
    'concealedSamples', 'silentConcealedSamples', 'insertedSamplesForDeceleration',
    'removedSamplesForAcceleration', 'audioLevel', 'totalAudioEnergy', 'totalSamplesDuration',
    'bytesSent', 'totalDecodeTime'
];

const keysToKeep = [
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

const cumulativeKeys = [
    'packetsReceived', 'framesDecoded', 'freezeCount', 'freezeDuration', 'bytesReceived',
    'totalPausesDuration', 'totalFreezesDuration', 'framesSent', 'framesEncoded',
    'keyFramesDecoded', 'keyFramesEncoded', 'qpSum', 'totalSamplesReceived', 'concealedSamples',
    'silentConcealedSamples', 'insertedSamplesForDeceleration', 'removedSamplesForAcceleration',
    'audioLevel', 'totalAudioEnergy', 'totalSamplesDuration', 'bytesSent', 'totalDecodeTime'
];

const freezeQueue = {}; // Queue to handle spreading freeze durations

function sortPeriodsByTimestamp(periods) {
    return periods.sort((a, b) => {
        const aTimestamp = Object.values(a).find(v => v && v.timestamp)?.timestamp || 0;
        const bTimestamp = Object.values(b).find(v => v && v.timestamp)?.timestamp || 0;
        return aTimestamp - bTimestamp;
    });
}

function splitPeerConnections(rawData) {
    const inboundPC = [];
    const outboundPC = [];

    rawData.forEach(period => {
        let hasInbound = false;
        let hasOutbound = false;

        for (const [key, value] of Object.entries(period)) {
            if (typeof value === 'object' && value !== null) {
                if (value.type === 'inbound-rtp') {
                    hasInbound = true;
                } else if (value.type === 'outbound-rtp') {
                    hasOutbound = true;
                }
            }
        }

        if (hasInbound) {
            inboundPC.push(period);
        }

        if (hasOutbound) {
            outboundPC.push(period);
        }
    });

    return {
        inboundPC: sortPeriodsByTimestamp(inboundPC),
        outboundPC: sortPeriodsByTimestamp(outboundPC),
    };
}

function filterKeys(data, keysToKeep) {
    const filteredData = {};
    for (const [key, value] of Object.entries(data)) {
        if (typeof value === 'object' && value !== null) {
            filteredData[key] = {};
            for (const [innerKey, innerValue] of Object.entries(value)) {
                if (keysToKeep.includes(innerKey)) {
                    filteredData[key][innerKey] = innerValue;
                }
            }
        } else if (keysToKeep.includes(key)) {
            filteredData[key] = value;
        }
    }
    return filteredData;
}

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

function calculateTargets(transformedData) {
    for (const [key, value] of Object.entries(transformedData)) {
        if (typeof value === 'object' && value !== null) {
            if ('frameHeight' in value) {
                value.frameHeightTargetPct = (value.frameHeight / frameHeightTarget) * 100;
            }
            if ('framesDecodedPerSecond' in value) {
                value.framerateTargetPct = (value.framesDecodedPerSecond / framerateTarget) * 100;
            }
            if ('framesDecodedPerSecond' in value && 'previousFramesDecodedPerSecond' in value) {
                const smoothness = Math.abs(value.framesDecodedPerSecond - value.previousFramesDecodedPerSecond) >= 2 ? 0 : 100;
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
            if (typesToKeep.includes(type) && kindsToKeep.includes(kind) && !ssrcToRemove.includes(ssrc)) {
                transformedData[key] = {};
                for (const [innerKey, innerValue] of Object.entries(value)) {
                    if (keysToTransform.includes(innerKey)) {
                        transformedData[key][innerKey] = innerValue;
                    }
                }

                const previousData = previousTransformedData[id];

                // Calculate per-second values for cumulative keys
                if (previousData && previousData[key] && previousData[key].id === id) {
                    const previousTimestamp = previousData[key].timestamp;
                    const currentTimestamp = timestamp;
                    const timeDiff = (currentTimestamp - previousTimestamp) / 1000; // Convert to seconds

                    if (timeDiff > 0) {
                        const percentOfSecs = 1 / timeDiff;
                        for (const innerKey of cumulativeKeys) {
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
                        // Copy previous perSecond values if no time difference
                        for (const innerKey of cumulativeKeys) {
                            if (`${innerKey}PerSecond` in previousData[key]) {
                                transformedData[key][`${innerKey}PerSecond`] = previousData[key][`${innerKey}PerSecond`];
                            }
                        }
                    }
                } else {
                    // For the first period, set per-second values equal to the current value
                    for (const innerKey of cumulativeKeys) {
                        if (innerKey in value) {
                            transformedData[key][`${innerKey}PerSecond`] = value[innerKey];
                        }
                    }
                }

                // Distribute pending freeze durations if any
                distributeFreezeDuration(id, key, transformedData);
            }
        }
    }

    // Calculate additional metrics based on targets
    calculateTargets(transformedData);

    return transformedData;
}

export function transformStats(rawData, previousTransformedData) {
    const { inboundPC, outboundPC } = splitPeerConnections(rawData);
    const transformedInboundPC = [];
    const transformedOutboundPC = [];

    inboundPC.forEach(period => {
        let transformedData = transformPeriod(period, previousTransformedData);
        transformedInboundPC.push(transformedData);
        for (const [key, value] of Object.entries(transformedData)) {
            if (value.id) {
                previousTransformedData[value.id] = { ...value, ...previousTransformedData[value.id], [key]: value }; // Store the latest transformed period data
            }
        }
    });

    outboundPC.forEach(period => {
        let transformedData = transformPeriod(period, previousTransformedData);
        transformedOutboundPC.push(transformedData);
        for (const [key, value] of Object.entries(transformedData)) {
            if (value.id) {
                previousTransformedData[value.id] = { ...value, ...previousTransformedData[value.id], [key]: value }; // Store the latest transformed period data
            }
        }
    });

    const filteredInboundPC = transformedInboundPC.map(data => filterKeys(data, keysToKeep));
    const filteredOutboundPC = transformedOutboundPC.map(data => filterKeys(data, keysToKeep));

    return { inboundPC: filteredInboundPC, outboundPC: filteredOutboundPC };
}

export function storePeriod(transformedData) {
    periods.inboundPC.push(...transformedData.inboundPC);
    periods.outboundPC.push(...transformedData.outboundPC);
}

export function logTransformedData(transformedDataArray) {
    console.info("[RTCStats] Transformed data:", transformedDataArray);
}

export function logStoredPeriods() {
    console.info("[RTCStats] Stored periods:", periods);
}

function calculateAverageMetrics() {
    let resolutions = [];
    let framerates = [];
    let freezeCounts = [];
    let freezeDurations = [];

    // Process inboundPC data
    periods.inboundPC.forEach(period => {
        Object.values(period).forEach(value => {
            if (typeof value === 'object' && value !== null) {
                if ('frameHeight' in value) resolutions.push(value.frameHeight || 0);
                if ('framesDecodedPerSecond' in value) framerates.push(value.framesDecodedPerSecond || 0);
                if ('freezeCountPerSecond' in value) freezeCounts.push(value.freezeCountPerSecond || 0);
                if ('totalFreezesDurationPerSecond' in value) freezeDurations.push(value.totalFreezesDurationPerSecond || 0);
            }
        });
    });

    // Process outboundPC data (if needed)
    periods.outboundPC.forEach(period => {
        Object.values(period).forEach(value => {
            if (typeof value === 'object' && value !== null) {
                // Add any relevant outbound metrics here
                // For example:
                // if ('frameHeight' in value) resolutions.push(value.frameHeight || 0);
            }
        });
    });

    const averageResolution = resolutions.length > 0 ? resolutions.reduce((acc, res) => acc + res, 0) / resolutions.length : 0;
    const averageFramerate = framerates.length > 0 ? framerates.reduce((acc, rate) => acc + rate, 0) / framerates.length : 0;
    const averageFreezeCount = freezeCounts.length > 0 ? freezeCounts.reduce((acc, count) => acc + count, 0) / freezeCounts.length : 0;
    const averageFreezeDuration = freezeDurations.length > 0 ? freezeDurations.reduce((acc, duration) => acc + duration, 0) / freezeDurations.length : 0;

    return {
        averageResolution,
        averageFramerate,
        averageFreezeCount,
        averageFreezeDuration,
    };
}

function calculateTargetPctMet() {
    const { averageResolution, averageFramerate, averageFreezeCount, averageFreezeDuration } = calculateAverageMetrics();
    const resolutionTargetPctMet = (averageResolution / frameHeightTarget) * 100;
    const smoothnessTargetPctMet = (averageFramerate / framerateTarget) * 100;
    const freezeCountTargetPctMet = (1 - averageFreezeCount) * 100;
    const freezeDurationTargetPctMet = (1 - averageFreezeDuration) * 100;
    return {
        resolutionTargetPctMet,
        smoothnessTargetPctMet,
        freezeCountTargetPctMet,
        freezeDurationTargetPctMet,
    };
}

export function calculateAggregatedStats() {
    const aggregatedStats = {
        averageResolution: calculateAverageMetrics().averageResolution,
        averageFramerate: calculateAverageMetrics().averageFramerate,
        averageFreezeCount: calculateAverageMetrics().averageFreezeCount,
        averageFreezeDuration: calculateAverageMetrics().averageFreezeDuration,
        resolutionTargetPctMet: calculateTargetPctMet().resolutionTargetPctMet,
        smoothnessTargetPctMet: calculateTargetPctMet().smoothnessTargetPctMet,
        freezeCountTargetPctMet: calculateTargetPctMet().freezeCountTargetPctMet,
        freezeDurationTargetPctMet: calculateTargetPctMet().freezeDurationTargetPctMet,

        // Add more calculated stats as needed
    };

    return aggregatedStats;
}

export function logAggregatedStats() {
    const aggregatedStats = calculateAggregatedStats();
    console.info("[RTCStats] Aggregated stats:", aggregatedStats);
}
