export const calculatePerSecondMetrics = (currentPeriod, previousPeriod, CUMULATIVE_KEYS, KEYS_TO_KEEP_AFTER_PER_SECOND_CALCULATIONS, TARGETS, connection_id) => {
    const perSecondMetrics = Object.entries(currentPeriod).reduce((acc, [key, current]) => {
        const previous = previousPeriod[key];
        let perSecondMetric = {};

        if (previous) {
            const deltaTime = (current.timestamp - previous.timestamp) / 1000;

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

        acc[key] = {
            'connection_id': connection_id,
            ...removeKeysAfterPerSecondCalculations(current, KEYS_TO_KEEP_AFTER_PER_SECOND_CALCULATIONS),
            ...perSecondMetric,
        };

        return acc;
    }, {});

    return calculatePerPeriodTargets(perSecondMetrics, TARGETS);
};

export const filterPeriodMetrics = (currentPeriod, TYPES_TO_KEEP, KINDS_TO_KEEP, SSRC_TO_REMOVE, KEYS_TO_KEEP) =>
    Object.entries(currentPeriod).reduce((acc, [key, metric]) => {
        if (!TYPES_TO_KEEP.includes(metric.type) ||
            (metric.kind && !KINDS_TO_KEEP.includes(metric.kind)) ||
            (metric.ssrc && SSRC_TO_REMOVE.includes(metric.ssrc))) {
            return acc;
        }

        acc[key] = KEYS_TO_KEEP.reduce((filteredMetric, keyToKeep) => {
            if (metric[keyToKeep] !== undefined) {
                filteredMetric[keyToKeep] = metric[keyToKeep];
            }
            return filteredMetric;
        }, {});

        return acc;
    }, {});

const removeKeysAfterPerSecondCalculations = (metrics, KEYS_TO_KEEP_AFTER_PER_SECOND_CALCULATIONS) =>
    KEYS_TO_KEEP_AFTER_PER_SECOND_CALCULATIONS.reduce((acc, key) => {
        if (metrics.hasOwnProperty(key)) {
            acc[key] = metrics[key];
        }
        return acc;
    }, {});

const calculatePerPeriodTargets = (metrics, TARGETS) =>
    Object.entries(metrics).reduce((acc, [key, value]) => {
        acc[key] = Object.entries(TARGETS).reduce((targets, [targetKey, targetValue]) => {
            const metricKey = targetKey.replace('Target', '');
            if (value.hasOwnProperty(metricKey)) {
                targets[`${metricKey}TargetPct`] = (value[metricKey] / targetValue) * 100;
            }
            return targets;
        }, value);
        return acc;
    }, {});

export const calculateSmoothness = (smoothnessBuffer, frameRatePeriodChange, frameRateDelta, callAverages) => {
    if (smoothnessBuffer.length < frameRatePeriodChange) {
        return smoothnessBuffer[smoothnessBuffer.length - 1];
    }

    const mostRecentPeriod = smoothnessBuffer[smoothnessBuffer.length - 1];
    const otherPeriod = smoothnessBuffer[smoothnessBuffer.length - frameRatePeriodChange];

    return Object.entries(mostRecentPeriod).reduce((acc, [key, recentValue]) => {
        if (otherPeriod.hasOwnProperty(key)) {
            const frameRateDeltaMetric = Math.abs(recentValue.framesDecodedPerSecond - otherPeriod[key].framesDecodedPerSecond);
            const smoothness = frameRateDeltaMetric >= frameRateDelta ? 0 : 100;
            const id = recentValue.id;

            acc[key] = {
                ...recentValue,
                smoothness: smoothness,
            };

            if (!callAverages[id]) {
                callAverages[id] = {
                    reportNum: 0,
                    frameHeight: { sum: 0, count: 0, avg: 0 },
                    framesDecodedPerSecond: { sum: 0, count: 0, avg: 0 },
                    freezeCountPerSecond: { sum: 0, count: 0, avg: 0 },
                    totalFreezesDurationPerSecond: { sum: 0, count: 0, avg: 0 },
                    smoothness: { sum: 0, count: 0, avg: 0 }
                };
            }

            updateCallAverages(acc[key], callAverages, id);
        }
        return acc;
    }, {});
};

const updateCallAverages = (metrics, callAverages, id) => {
    const metricsToUpdate = ['frameHeight', 'framesDecodedPerSecond', 'freezeCountPerSecond', 'totalFreezesDurationPerSecond', 'smoothness'];
    callAverages[id].reportNum += 1;

    metricsToUpdate.forEach(metric => {
        if (metrics[metric] !== undefined) {
            callAverages[id][metric].sum += metrics[metric];
            callAverages[id][metric].count += 1;
            callAverages[id][metric].avg = callAverages[id][metric].sum / callAverages[id][metric].count;
        }
    });
};

export const updateCallTargets = (callAverages, callTargets, TARGETS, id) => {
    if (!callTargets[id]) {
        callTargets[id] = {
            reportNum: 0,
            frameHeightTargetPct: 100,
            framesDecodedPerSecondTargetPct: 100,
            freezeCountPerSecondTargetPct: 100,
            totalFreezesDurationPerSecondTargetPct: 100,
            smoothnessTargetPct: 100
        };
    }

    const metricsToUpdate = [
        { metric: 'frameHeight', target: 'frameHeight' },
        { metric: 'framesDecodedPerSecond', target: 'framesDecodedPerSecond' },
        { metric: 'freezeCountPerSecond', target: 'freezeCountPerSecond', invert: true },
        { metric: 'totalFreezesDurationPerSecond', target: 'totalFreezesDurationPerSecond', invert: true },
        { metric: 'smoothness', target: 'smoothnessTarget' }
    ];

    metricsToUpdate.forEach(({ metric, target, invert }) => {
        if (callAverages[id][metric].avg !== undefined) {
            const value = invert ? 1 - callAverages[id][metric].avg : callAverages[id][metric].avg;
            callTargets[id][`${metric}TargetPct`] = (value / TARGETS[target]) * 100;
            callTargets[id].reportNum = callAverages[id].reportNum;
        }
    });
};