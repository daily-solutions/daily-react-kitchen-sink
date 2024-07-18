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

    let perSecondMetricsWithTargets = {};
    perSecondMetricsWithTargets = calculatePerPeriodTargets(perSecondMetrics, TARGETS);

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

export function calculateSmoothness(currentPerSecondData, previousPerSecondData) {
    let perSecondDataWithSmoothness = {};

    for (const key in currentPerSecondData) {
        if (currentPerSecondData.hasOwnProperty(key)) {
            const current = currentPerSecondData[key];

            if (previousPerSecondData.hasOwnProperty(key)) {
                const previous = previousPerSecondData[key];

                if (current.framesDecodedPerSecond !== undefined && previous.framesDecodedPerSecond !== undefined) {
                    // Calculate smoothness (example calculation, replace with your logic)
                    const frameRateDelta = Math.abs(current.framesDecodedPerSecond - previous.framesDecodedPerSecond)
                    current.smoothness = frameRateDelta >= 5 ? 0 : 100;

                }
            }

            perSecondDataWithSmoothness[key] = current;
        }
    }

    return perSecondDataWithSmoothness;
}

export function distributeFreezeDuration(batch, connectionId) {
    const periodLength = batch.length;
    const currentData = batch[periodLength - 1];

    if (!currentData) return batch; // If there's no current data, return the batch as is.

    let remainingFreezeCount = currentData.freezeCountPerSecond;
    let remainingFreezeDuration = currentData.totalFreezesDurationPerSecond;

    if (remainingFreezeCount > 0 || remainingFreezeDuration > 0) {
        // Distribute the freeze count
        for (let i = periodLength - 1; i >= 0 && remainingFreezeCount > 0; i--) {
            const freezeCountToDistribute = Math.min(1, remainingFreezeCount);
            batch[i].freezeCountPerSecond = (batch[i].freezeCountPerSecond || 0) + freezeCountToDistribute;
            remainingFreezeCount -= freezeCountToDistribute;
        }

        // Distribute the freeze duration
        for (let i = periodLength - 1; i >= 0 && remainingFreezeDuration > 0; i--) {
            const freezeDurationToDistribute = Math.min(1, remainingFreezeDuration);
            batch[i].totalFreezesDurationPerSecond = (batch[i].totalFreezesDurationPerSecond || 0) + freezeDurationToDistribute;
            remainingFreezeDuration -= freezeDurationToDistribute;
        }

        // Set the last period's values to the remainder if any
        if (remainingFreezeCount > 0) {
            batch[periodLength - 1].freezeCountPerSecond += remainingFreezeCount;
        }
        if (remainingFreezeDuration > 0) {
            batch[periodLength - 1].totalFreezesDurationPerSecond += remainingFreezeDuration;
        }
    }

    return batch;
}

