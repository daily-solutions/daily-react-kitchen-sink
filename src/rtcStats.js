import { calculateSmoothness, filterPeriodMetrics, calculatePerSecondMetrics, updateCallTargets } from "./rtcStats/rtcStatsUtils.js";
import { TARGETS, CUMULATIVE_KEYS, KINDS_TO_KEEP, KEYS_TO_KEEP, TYPES_TO_KEEP, SSRC_TO_REMOVE, KEYS_TO_KEEP_AFTER_PER_SECOND_CALCULATIONS } from './rtcStats/constants';

export function rtcStats(config) {
  if (window.rtcstats) {
    console.warn("[RTCStats] Already declared");
    return;
  }
  window.rtcstats = this;

  const _config = {
    report_interval: 1,
    log_interval: 5,
    frameRatePeriodChange: 2,
    frameRateDelta: 5,
    ...config
  };

  const peerConns = [];
  const callAveragesArray = []; // Needs to be an array because of the peer connections. By the end of this process, we filter out empty ones. So in that case, there might be only one object in the array. But if we use this for other providers who use multiple peer connections, or track outbound metrics, this array will have more objects.
  const rawReports = {};
  const currentFilteredReports = {};
  const previousFilteredReports = {};
  const currentPerSecondReport = {};

  const isObjectEmpty = (obj) => Object.keys(obj).length === 0;

  async function store(data) {
    console.info("[RTCStats] Logging data...", data);
    console.log("[RTCStats] Logging data at the time...", structuredClone(data));
    // Store report array here
  }

  async function logCallTarget(callTargetCollection) {
    callTargetCollection.forEach(({ callAverages, callTargets }) => {
      Object.keys(callAverages).forEach(id => {
        updateCallTargets(callAverages, callTargets, TARGETS, id);
      });
    });
    const finalCallTargetCollection = {
      reportNum: 0,
      test_id: _config.test_id,
      callTargetCollection
    };
    finalCallTargetCollection.reportNum += 1;

    if (!isObjectEmpty(finalCallTargetCollection.callTargetCollection)) {
      await store(finalCallTargetCollection);
    }
  }

  async function logBatch(batchCollection) {
    const reportArray = batchCollection.flatMap(b =>
      b.splice(0, b.length).map(data => ({
        test_id: _config.test_id,
        data,
      }))
    );

    if (reportArray.length) {
      await store(reportArray);
    }
  }

  class RTCStatsPeerConnection extends RTCPeerConnection {
    constructor(config) {
      super(config);

      this.report = {
        batch: [],
        report_num: 0,
        connection_id: crypto.randomUUID(),
      };
      this.calculations = {
        smoothnessBuffer: [],
        callAverages: {},
        callTargets: {},
      };

      peerConns.push(this.report);
      callAveragesArray.push({ callAverages: this.calculations.callAverages, callTargets: this.calculations.callTargets });

      console.warn("PeerConnection instantiated", this.report);

      this.addEventListener("connectionstatechange", this.handleConnectionStateChange.bind(this));
    }

    handleConnectionStateChange() {
      clearInterval(this._statsInterval);

      if (this.connectionState === "connected") {
        this._getStats(this.getStats());

        this._statsInterval = setInterval(() => {
          if (this.connectionState !== "connected") {
            return clearInterval(this._statsInterval);
          }
          this._getStats(this.getStats());
        }, _config.report_interval * 1000);
      }
    }

    async _getStats(getStatsPromise) {
      const stats = await getStatsPromise;
      const rtcdata = Object.fromEntries(stats.entries());
      if (!rtcdata) return;

      previousFilteredReports[this.report.connection_id] = { ...currentFilteredReports[this.report.connection_id] };
      rawReports[this.report.connection_id] = {
        clientId: _config.client_id,
        testId: _config.test_id,
        connectionId: this.report.connection_id,
        reportNum: this.report.report_num,
        ...rtcdata,
      };
      currentFilteredReports[this.report.connection_id] = filterPeriodMetrics(rawReports[this.report.connection_id], TYPES_TO_KEEP, KINDS_TO_KEEP, SSRC_TO_REMOVE, KEYS_TO_KEEP);
      currentPerSecondReport[this.report.connection_id] = calculatePerSecondMetrics(currentFilteredReports[this.report.connection_id], previousFilteredReports[this.report.connection_id], CUMULATIVE_KEYS, KEYS_TO_KEEP_AFTER_PER_SECOND_CALCULATIONS, TARGETS, this.report.connection_id);

      if (!isObjectEmpty(currentPerSecondReport[this.report.connection_id])) {
        this.calculations.smoothnessBuffer.push(currentPerSecondReport[this.report.connection_id]);
        if (this.calculations.smoothnessBuffer.length > _config.frameRatePeriodChange) {
          this.calculations.smoothnessBuffer.shift();
        }
        const metricsWithSmoothness = calculateSmoothness(this.calculations.smoothnessBuffer, _config.frameRatePeriodChange, _config.frameRateDelta, this.calculations.callAverages);
        this.report.batch.push(metricsWithSmoothness);
        this.report.report_num += 1;
      }
    }
  }

  if (!["test_id", "client_id"].every((k) => k in _config)) {
    console.warn("[RTCStats] Missing config keys. Exiting");
  } else {
    console.info(`[RTCStats] Init with config:`, _config);
    RTCPeerConnection = RTCStatsPeerConnection;

    setInterval(() => {
      if (peerConns.length) {
        const batchCollection = peerConns
          .filter((pc) => pc.batch.length)
          .map((pc) => pc.batch);
        const callTargetCollection = callAveragesArray
          .filter((ca) => Object.keys(ca.callAverages).length);
        if (batchCollection.length) {
          logBatch(batchCollection);
          logCallTarget(callTargetCollection);
        }
      }
    }, _config.log_interval * 1000);
  }
}