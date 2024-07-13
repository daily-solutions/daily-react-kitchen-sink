const periods = []; // Array to store transformed metrics per period

const typesToKeep = ["inbound-rtp", "outbound-rtp", "remote-inbound-rtp", "remote-outbound-rtp"];
const kindsToKeep = ["audio", "video"];
const ssrcToRemove = [1234];

const keysToTransform = [
    'id',
    'timestamp',
    'type',
    'kind',
    'ssrc',
    'transportId',
    'jitter',
    'packetsLost',
    'packetsReceived',
    'framesDecoded',
    'freezeCount',
    'freezeDuration',
    'frameHeight',
    'bytesReceived'
];

const keysToKeep = [
    'id',
    'timestamp',
    'type',
    'kind',
    'ssrc',
    'transportId',
    'packetsReceivedPerSecond',
    'framesDecodedPerSecond',
    'freezeCountPerSecond',
    'freezeDurationPerSecond',
    'bytesReceivedPerSecond',
];

const cumulativeKeys = [
    'packetsReceived',
    'framesDecoded',
    'freezeCount',
    'freezeDuration',
    'bytesReceived'
];

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
                        for (const innerKey of cumulativeKeys) {
                            if (innerKey in value) {
                                const previousValue = previousData[key][innerKey] || 0;
                                const currentValue = value[innerKey];
                                const diffValue = currentValue - previousValue;
                                const perSecondValue = diffValue / timeDiff;

                                console.log(`Previous value for ${innerKey}: ${previousValue}`);
                                console.log(`Current value for ${innerKey}: ${currentValue}`);
                                console.log(`Calculating per-second value for ${innerKey}: ${currentValue} - ${previousValue} / ${timeDiff} = ${perSecondValue}`);

                                transformedData[key][`${innerKey}PerSecond`] = perSecondValue;
                            }
                        }
                    } else {
                        console.log(`+++ Time difference is 0, here is the previous data for ${key}: ${JSON.stringify(previousData[key])}`);
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
                            console.log(`Setting initial per-second value for ${innerKey}: ${value[innerKey]}`);
                        }
                    }
                }
            }
        }
    }

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
    periods.push({
        timestamp: Date.now(),
        data: transformedData,
    });
}

export function logTransformedData(transformedDataArray) {
    console.info("[RTCStats] Transformed data:", transformedDataArray);
}

export function logStoredPeriods() {
    console.info("[RTCStats] Stored periods:", periods);
}

export function calculateAggregatedStats() {
    const aggregatedStats = {
        videoQuality: calculateVideoQuality(),
        smoothness: calculateSmoothness(),
        // Add more calculated stats as needed
    };

    return aggregatedStats;
}

function calculateVideoQuality() {
    const resolutions = periods.map(period => period.data.frameHeight?.perSecond || 0);
    const averageResolution = resolutions.reduce((acc, res) => acc + res, 0) / resolutions.length;
    return averageResolution; // Placeholder logic
}

function calculateSmoothness() {
    const framerates = periods.map(period => period.data.framesDecodedPerSecond || 0);
    const averageFramerate = framerates.reduce((acc, rate) => acc + rate, 0) / framerates.length;
    return averageFramerate; // Placeholder logic
}

export function logAggregatedStats() {
    const aggregatedStats = calculateAggregatedStats();
    console.info("[RTCStats] Aggregated stats:", aggregatedStats);
}
