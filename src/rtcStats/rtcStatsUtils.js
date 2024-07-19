export function calculatePerSecondMetrics(currentPeriod, previousPeriod, CUMULATIVE_KEYS, KEYS_TO_KEEP_AFTER_PER_SECOND_CALCULATIONS, TARGETS, connection_id) {
    const perSecondMetrics = {};

    for (const key in currentPeriod) {
        if (currentPeriod.hasOwnProperty(key)) {
            const current = currentPeriod[key];
            const previous = previousPeriod[key];
            let perSecondMetric = {};

            if (previous) {
                const deltaTime = (current.timestamp - previous.timestamp) / 1000; // Convert milliseconds to seconds

                if (deltaTime > 0) {
                    CUMULATIVE_KEYS.forEach((metricKey) => {
                        if (current[metricKey] !== undefined && previous[metricKey] !== undefined) {
                            perSecondMetric[`${metricKey}PerSecond`] = (current[metricKey] - previous[metricKey]) / deltaTime;
                        }
                    });
                }
            } else {
                CUMULATIVE_KEYS.forEach((metricKey) => {
                    if (current[metricKey] !== undefined) {
                        perSecondMetric[`${metricKey}PerSecond`] = current[metricKey];
                    }
                });
            }

            perSecondMetrics[key] = {
                'connection_id': connection_id,
                ...removeKeysAfterPerSecondCalculations(current, KEYS_TO_KEEP_AFTER_PER_SECOND_CALCULATIONS),
                ...perSecondMetric,
            };

        }
    }

    let perSecondMetricsWithTargets = calculatePerPeriodTargets(perSecondMetrics, TARGETS);
    return perSecondMetricsWithTargets;
}



export function filterPeriodMetrics(currentPeriod, TYPES_TO_KEEP, KINDS_TO_KEEP, SSRC_TO_REMOVE, KEYS_TO_KEEP) {
    const filteredMetrics = {};

    for (const key in currentPeriod) {
        const metric = currentPeriod[key];

        // Check if the type is in TYPES_TO_KEEP
        if (!TYPES_TO_KEEP.includes(metric.type)) {
            continue;
        }

        // Check if the kind is in KINDS_TO_KEEP (if kind exists)
        if (metric.kind && !KINDS_TO_KEEP.includes(metric.kind)) {
            continue;
        }

        // Check if the ssrc is not in SSRC_TO_REMOVE (if ssrc exists)
        if (metric.ssrc && SSRC_TO_REMOVE.includes(metric.ssrc)) {
            continue;
        }

        // Filter the keys to only keep KEYS_TO_KEEP
        const filteredMetric = {};
        for (const keyToKeep of KEYS_TO_KEEP) {
            if (metric[keyToKeep] !== undefined) {
                filteredMetric[keyToKeep] = metric[keyToKeep];
            }
        }

        filteredMetrics[key] = filteredMetric;
    }

    return filteredMetrics;
}

function removeKeysAfterPerSecondCalculations(metrics, KEYS_TO_KEEP_AFTER_PER_SECOND_CALCULATIONS) {
    const filteredMetrics = {};

    for (const keysToKeep of KEYS_TO_KEEP_AFTER_PER_SECOND_CALCULATIONS) {
        if (metrics.hasOwnProperty(keysToKeep)) {
            filteredMetrics[keysToKeep] = metrics[keysToKeep];
        }
    }
    return filteredMetrics;
}

function calculatePerPeriodTargets(metrics, TARGETS) {
    const targets = {};

    for (const key in metrics) {
        if (metrics.hasOwnProperty(key)) {
            const value = metrics[key];

            for (const targetKey in TARGETS) {
                if (TARGETS.hasOwnProperty(targetKey)) {
                    const metricKey = targetKey.replace('Target', ''); // Remove 'Target' to match the metric key

                    if (value.hasOwnProperty(metricKey)) {
                        value[`${metricKey}TargetPct`] = (value[metricKey] / TARGETS[targetKey]) * 100;
                    }
                }
            }

            targets[key] = value;
        }
    }

    return targets;
}

export function calculateSmoothness(smoothnessBuffer, frameRatePeriodChange, frameRateDelta, callAverages) {
    let perSecondDataWithSmoothness = {};
    let id = "";

    // Initialize smoothness to 100 for all periods in the buffer
    smoothnessBuffer.forEach(period => {
        for (const key in period) {
            if (period.hasOwnProperty(key)) {
                period[key].smoothness = 100;
            }
        }
    });

    // Ensure the buffer has at least frameRatePeriodChange periods
    if (smoothnessBuffer.length < frameRatePeriodChange) {
        return smoothnessBuffer[smoothnessBuffer.length - 1]; // Return the most recent period with smoothness set to 100
    }

    // Get the most recent period and the 5th period from the buffer
    const mostRecentPeriod = smoothnessBuffer[smoothnessBuffer.length - 1];
    const otherPeriod = smoothnessBuffer[smoothnessBuffer.length - frameRatePeriodChange];

    for (const key in mostRecentPeriod) {
        if (mostRecentPeriod.hasOwnProperty(key) && otherPeriod.hasOwnProperty(key)) {
            const recentFramesDecoded = mostRecentPeriod[key].framesDecodedPerSecond;
            const otherPeriodFramesDecoded = otherPeriod[key].framesDecodedPerSecond;

            // We calculate smoothness by getting the framerate delta from the current period, and a period X periods ago
            const frameRateDeltaMetric = Math.abs(recentFramesDecoded - otherPeriodFramesDecoded);

            // If the delta is greater than the frameRateDelta specified, we say the stream is not smooth. Therefor 0%. If its less than the frameRateDelta, we say its 100% smooth.
            const smoothness = frameRateDeltaMetric >= frameRateDelta ? 0 : 100;

            id = mostRecentPeriod[key].id;
            console.log("+++++ id: ", id);

            // Add smoothness metric to the most recent period
            perSecondDataWithSmoothness[key] = {
                ...mostRecentPeriod[key],
                smoothness: smoothness,
            };

            // Ensure callAverages has an entry for this id
            if (!callAverages[id]) {
                callAverages[id] = {
                    frameHeight: { sum: 0, count: 0, avg: 0 },
                    framesDecodedPerSecond: { sum: 0, count: 0, avg: 0 },
                    freezeCountPerSecond: { sum: 0, count: 0, avg: 0 },
                    totalFreezesDurationPerSecond: { sum: 0, count: 0, avg: 0 },
                    smoothness: { sum: 0, count: 0, avg: 0 }
                };
            }

            updateCallAverages(perSecondDataWithSmoothness[key], callAverages, id);
        }
    }



    return perSecondDataWithSmoothness;
}

function updateCallAverages(metrics, callAverages, id) {
    // Ensure callAverages has an entry for this id
    if (!callAverages[id]) {
        callAverages[id] = {
            frameHeight: { sum: 0, count: 0, avg: 0 },
            framesDecodedPerSecond: { sum: 0, count: 0, avg: 0 },
            freezeCountPerSecond: { sum: 0, count: 0, avg: 0 },
            totalFreezesDurationPerSecond: { sum: 0, count: 0, avg: 0 },
            smoothness: { sum: 0, count: 0, avg: 0 }
        };
    }

    // Update frameHeight average
    if (metrics.frameHeight !== undefined) {
        callAverages[id].frameHeight.sum += metrics.frameHeight;
        callAverages[id].frameHeight.count += 1;
        callAverages[id].frameHeight.avg = callAverages[id].frameHeight.sum / callAverages[id].frameHeight.count;
    }

    // Update framesDecodedPerSecond average
    if (metrics.framesDecodedPerSecond !== undefined) {
        callAverages[id].framesDecodedPerSecond.sum += metrics.framesDecodedPerSecond;
        callAverages[id].framesDecodedPerSecond.count += 1;
        callAverages[id].framesDecodedPerSecond.avg = callAverages[id].framesDecodedPerSecond.sum / callAverages[id].framesDecodedPerSecond.count;
    }

    // Update freezeCountPerSecond average
    if (metrics.freezeCountPerSecond !== undefined) {
        callAverages[id].freezeCountPerSecond.sum += metrics.freezeCountPerSecond;
        callAverages[id].freezeCountPerSecond.count += 1;
        callAverages[id].freezeCountPerSecond.avg = callAverages[id].freezeCountPerSecond.sum / callAverages[id].freezeCountPerSecond.count;
    }

    // Update totalFreezesDurationPerSecond average
    if (metrics.totalFreezesDurationPerSecond !== undefined) {
        callAverages[id].totalFreezesDurationPerSecond.sum += metrics.totalFreezesDurationPerSecond;
        callAverages[id].totalFreezesDurationPerSecond.count += 1;
        callAverages[id].totalFreezesDurationPerSecond.avg = callAverages[id].totalFreezesDurationPerSecond.sum / callAverages[id].totalFreezesDurationPerSecond.count;
    }

    // Update smoothness average
    if (metrics.smoothness !== undefined) {
        callAverages[id].smoothness.sum += metrics.smoothness;
        callAverages[id].smoothness.count += 1;
        callAverages[id].smoothness.avg = callAverages[id].smoothness.sum / callAverages[id].smoothness.count;
    }
}

export function getAllKeyNames(callTargetCollection) {
    const keyNames = new Set(); // Use a set to avoid duplicate keys

    callTargetCollection.forEach(item => {
        if (item.callAverages) {
            Object.keys(item.callAverages).forEach(key => {
                keyNames.add(key);
            });
        }
    });

    return Array.from(keyNames);
}

export function updateCallTargets(callAverages, callTargets, TARGETS, id) {
    if (!callTargets[id]) {
        callTargets[id] = {
            frameHeightTargetPct: 100,
            framesDecodedPerSecondTargetPct: 100,
            freezeCountPerSecondTargetPct: 100,
            totalFreezesDurationPerSecondTargetPct: 100,
            smoothnessTargetPct: 100
        };
    }

    // Update frameHeight target
    if (callAverages[id].frameHeight.avg !== undefined) {
        callTargets[id].frameHeightTargetPct = (callAverages[id].frameHeight.avg / TARGETS.frameHeight) * 100;
    }
    // Update framesDecodedPerSecond target
    if (callAverages[id].framesDecodedPerSecond.avg !== undefined) {
        callTargets[id].framesDecodedPerSecondTargetPct = (callAverages[id].framesDecodedPerSecond.avg / TARGETS.framesDecodedPerSecond) * 100;
    }
    // Update freezeCountPerSecond target
    if (callAverages[id].freezeCountPerSecond.avg !== undefined) {
        callTargets[id].freezeCountPerSecondTargetPct = ((1 - callAverages[id].freezeCountPerSecond.avg) / TARGETS.freezeCountPerSecond) * 100;
    }
    // Update totalFreezesDurationPerSecond target
    if (callAverages[id].totalFreezesDurationPerSecond.avg !== undefined) {
        callTargets[id].totalFreezesDurationPerSecondTargetPct = ((1 - callAverages[id].totalFreezesDurationPerSecond.avg) / TARGETS.totalFreezesDurationPerSecond) * 100;
    }
    // Update smoothness target
    if (callAverages[id].smoothness.avg !== undefined) {
        callTargets[id].smoothnessTargetPct = (callAverages[id].smoothness.avg / TARGETS.smoothnessTarget) * 100;
    }

}