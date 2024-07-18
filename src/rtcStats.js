import { calculateSmoothness, filterPeriodMetrics, calculatePerSecondMetrics, distributeFreezeDuration } from "./rtcStats/rtcStatsUtils.js";
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
    ...config
  };

  // Reference all active WebRTC peer connections
  const peerConns = [];
  const rawReports = {};
  const currentFilteredReports = {};
  const previousFilteredReports = {};
  const currentPerSecondReport = {};
  const previousPerSecondReport = {};

  async function store(reportArray) {
    console.info("[RTCStats] Logging data...", reportArray);
    // Store report array here
  }

  async function logBatch(batchCollection) {
    // Note: async function so main event loop is kept unblocked
    const reportArray = [];
    batchCollection.forEach((b) => {
      // grab the reports and empty the array (batch is cleared)
      const reports = b.splice(0, b.length).forEach((data) =>
        reportArray.push({
          test_id: _config.test_id,
          data,
        })
      );
    });

    if (!reportArray.length) {
      return;
    }
    console.log("++++++ reportArray", reportArray, this.connection_id);
    store(reportArray);
  }

  function isObjectEmpty(obj) {
    return Object.keys(obj).length === 0;
  }

  /**
   * -----------------------
   * RTCPeerConnection shim
   * -----------------------
   */
  class RTCStatsPeerConnection extends RTCPeerConnection {
    constructor(config) {
      super(config);

      // Init
      this.batch = []; // Array of reports collected
      this.report_num = 0; // Current tick for timeseries
      this.connection_id = crypto.randomUUID();

      // Append to global array
      peerConns.push(this);

      console.warn("PeerConnection instantiated", this);

      // Listen for connection state, start harvesting when connected
      this.addEventListener("connectionstatechange", () => {
        clearInterval(this._statsInterval);

        if (this.connectionState === "connected") {
          this._getStats(this.getStats());

          // Start collecting data every TICK...
          this._statsInterval = setInterval(() => {
            if (this.connectionState !== "connected")
              return clearInterval(this._statsInterval);

            // Run an override of the getStats method
            this._getStats(this.getStats());
          }, _config.report_interval * 1000);
        }
      });
    }



    async _getStats(getStatsPromise) {
      const stats = await getStatsPromise;
      const rtcdata = Object.fromEntries(stats.entries());
      if (!rtcdata) return;

      // Store previous and current filtered reports based on connection_id
      previousFilteredReports[this.connection_id] = { ...currentFilteredReports[this.connection_id] };
      rawReports[this.connection_id] = {
        clientId: _config.client_id,
        testId: _config.test_id,
        connectionId: this.connection_id,
        reportNum: this.report_num,
        ...rtcdata,
      };
      console.log("++++++ connection id", this.connection_id);
      // Filter data from the raw reports we're getting from rtcStats. We're only interested in certain types of metrics.
      currentFilteredReports[this.connection_id] = filterPeriodMetrics(rawReports[this.connection_id], TYPES_TO_KEEP, KINDS_TO_KEEP, SSRC_TO_REMOVE, KEYS_TO_KEEP);
      // Then calculate the per second metrics based on the filtered reports. Report also contains targets.
      previousPerSecondReport[this.connection_id] = { ...currentPerSecondReport[this.connection_id] };
      currentPerSecondReport[this.connection_id] = calculatePerSecondMetrics(currentFilteredReports[this.connection_id], previousFilteredReports[this.connection_id], CUMULATIVE_KEYS, KEYS_TO_KEEP_AFTER_PER_SECOND_CALCULATIONS, TARGETS, this.connection_id);

      // If the per second reports are not empty, push them to the batch array. Reports may be empty because of peer connections that do not contain metrics we're interested in.
      if (!isObjectEmpty(currentPerSecondReport[this.connection_id])) {
        console.log("++++++ previous per second report", previousPerSecondReport[this.connection_id])
        console.log("++++++ per second report", currentPerSecondReport[this.connection_id]);
        let metricsWithSmoothness = {}
        metricsWithSmoothness = calculateSmoothness(currentPerSecondReport[this.connection_id], previousPerSecondReport[this.connection_id]);
        console.log("++++++ metrics with smoothness", metricsWithSmoothness);
        this.batch.push(currentPerSecondReport[this.connection_id]);

        this.report_num += 1;
      }
    }
  }

  /**
   * -----------------------
   * Init method
   * -----------------------
   */
  if (!["test_id", "client_id"].every((k) => k in _config)) {
    console.warn("[RTCStats] Missing config keys. Exiting");
  } else {
    console.info(`[RTCStats] Init with config:`, _config);
    RTCPeerConnection = RTCStatsPeerConnection;

    // Main write interval
    setInterval(() => {
      if (!peerConns.length) {
        // No connected peers, do nothing
        return;
      }

      // Create a batch of reports from each peer connection
      const batchCollection = peerConns
        .filter((pc) => pc.batch.length) // filter out PeerConnections with empty batches (no reports)
        .map((pc) => pc.batch); // return the batch array containing all the reports (arbitrary amount)
      if (batchCollection.length) {
        logBatch(batchCollection);
      }
    }, _config.log_interval * 1000);
  }
}
