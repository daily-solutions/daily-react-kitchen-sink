// rtcStats.js
import { transformStats, logTransformedData, storePeriod, logStoredPeriods, logAggregatedStats } from './rtcStatsUtils';

export function initializeRTCStats() {
  if (window.rtcstats) {
    console.warn("[RTCStats] Already declared");
    return;
  }

  window.rtcstats = this;

  const test_id = document.currentScript?.getAttribute("test_id") || crypto.randomUUID();
  const client_id = document.currentScript?.getAttribute("client_id") || crypto.randomUUID();
  const report_interval = document.currentScript?.getAttribute("report_interval") || 1;
  const log_interval = document.currentScript?.getAttribute("log_interval") || 5;

  const _config = {
    report_interval: report_interval,
    log_interval: log_interval,
    test_id,
    client_id,
  };

  const peerConns = [];
  let transformedStatsArray = []; // Array to store transformed stats
  const previousReports = new Map(); // Store previous reports to compare across intervals

  async function store(reportArray) {
    console.info("[RTCStats] Logging raw data...", reportArray);
    // Store report array here
  }

  async function logBatch(batchCollection) {
    const reportArray = [];

    batchCollection.forEach((b) => {
      b.splice(0, b.length).forEach((data) => {
        const rawReport = {
          clientId: _config.client_id,
          testId: _config.test_id,
          connectionId: data.connectionId,
          reportNum: data.reportNum,
          ...data,
        };

        reportArray.push(rawReport);
      });
    });

    if (!reportArray.length) {
      return;
    }

    store(reportArray); // Log raw data

    const transformedData = transformStats(reportArray, previousReports);
    transformedStatsArray.push(transformedData); // Accumulate transformed stats

    storePeriod(transformedData); // Store transformed periods
  }

  async function logTransformedAndAggregatedStats() {
    logTransformedData(transformedStatsArray); // Log accumulated transformed stats
    transformedStatsArray = []; // Clear array after logging
    logStoredPeriods(); // Log stored periods
    logAggregatedStats(); // Log aggregated stats
  }

  class RTCStatsPeerConnection extends RTCPeerConnection {
    constructor(config) {
      super();

      this.batch = [];
      this.report_num = 0;
      this.connection_id = crypto.randomUUID();

      peerConns.push(this);

      console.warn("PeerConnection instantiated", this);

      this.addEventListener("connectionstatechange", () => {
        clearInterval(this._statsInterval);

        if (this.connectionState === "connected") {
          this._getStats(this.getStats());

          this._statsInterval = setInterval(() => {
            if (this.connectionState !== "connected")
              return clearInterval(this._statsInterval);

            this._getStats(this.getStats());
          }, _config.report_interval * 1000);
        }
      });
    }

    async _getStats(getStatsPromise) {
      const stats = await getStatsPromise;
      const rtcdata = Object.fromEntries(stats.entries());

      if (!rtcdata) return;

      this.batch.push({
        clientId: _config.client_id,
        testId: _config.test_id,
        connectionId: this.connection_id,
        reportNum: this.report_num,
        ...rtcdata,
      });

      this.report_num += 1;
    }
  }

  if (!["test_id", "client_id"].every((k) => k in _config)) {
    console.warn("[RTCStats] Missing config keys. Exiting");
  } else {
    console.info(`[RTCStats] Init with config:`, _config);
    RTCPeerConnection = RTCStatsPeerConnection;

    setInterval(() => {
      if (!peerConns.length) {
        return;
      }
      const batchCollection = peerConns.filter((pc) => pc.batch.length).map((pc) => pc.batch);
      if (batchCollection.length) {
        logBatch(batchCollection); // Log raw data every log_interval
        logTransformedAndAggregatedStats(); // Log transformed and aggregated data every log_interval
      }
    }, _config.log_interval * 1000);
  }
}
