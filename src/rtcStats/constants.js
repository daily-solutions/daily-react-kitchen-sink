export const TARGETS = {
    frameHeight: 720, // Aiming for 720p
    framesDecodedPerSecond: 30, // Aiming for 30 fps
    smoothnessTarget: 100, // Aiming for 100% smoothness
    freezeCountPerSecond: 1, // Inverted so we don't divide by 0. We also invert the actual freeze duration per second
    totalFreezesDurationPerSecond: 1 // Inverted so we don't divide by 0. We also invert the actual freeze duration per second
};

export const TYPES_TO_KEEP = [
    "inbound-rtp",
];


export const KINDS_TO_KEEP = [
    "video"
];

export const SSRC_TO_REMOVE = [1234];


export const KEYS_TO_KEEP = [
    'id', 'timestamp', 'type', 'kind', 'ssrc', 'transportId', 'framesDecoded',
    'freezeCount', 'frameHeight', 'bytesReceived', 'totalFreezesDuration'
];


export const KEYS_TO_KEEP_AFTER_PER_SECOND_CALCULATIONS = [
    'id', 'timestamp', 'type', 'kind', 'ssrc', 'transportId',
    'framesDecodedPerSecond', 'freezeCountPerSecond', 'frameHeight', 'totalFreezesDurationPerSecond',
    'samplesDurationPerSecond', 'frameHeightTargetPct', 'framerateTargetPct', 'smoothnessTargetPct',
    'freezeTargetPct', 'freezeDurationTargetPct'
];


export const CUMULATIVE_KEYS = [
    'framesDecoded', 'freezeCount', 'totalFreezesDuration'
];
