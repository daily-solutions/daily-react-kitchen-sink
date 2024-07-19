import { getAllKeyNames, calculateSmoothness, filterPeriodMetrics, calculatePerSecondMetrics, updateCallTargets } from "./rtcStats/rtcStatsUtils.js";
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

  // Reference all active WebRTC peer connections
  const peerConns = [];
  const callAveragesArray = [];
  const rawReports = {};
  const currentFilteredReports = {};
  const previousFilteredReports = {};
  const currentPerSecondReport = {};
  const previousPerSecondReport = {};

  function isObjectEmpty(obj) {
    return Object.keys(obj).length === 0;
  }

  async function store(data) {
    console.info("[RTCStats] Logging data...", data);
    // Store report array here
  }

  async function logCallTarget(callTargetCollection) {

    callTargetCollection.forEach(item => {
      const callAverages = item.callAverages;
      const callTargets = item.callTargets;

      const ids = Object.keys(callAverages);

      ids.forEach(id => {
        updateCallTargets(callAverages, callTargets, TARGETS, id);
      });
    });

    const finalCallTargetCollection = {
      test_id: _config.test_id,
      callTargetCollection
    };

    if (!isObjectEmpty(finalCallTargetCollection.callTargetCollection)) {
      store(finalCallTargetCollection);
    }
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
    store(reportArray);
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
      this.report = {
        batch: [], // Array of reports collected
        report_num: 0, // Current tick for timeseries
        connection_id: crypto.randomUUID(),
      };
      this.calculations = {
        smoothnessBuffer: [],
        callAverages: {
        },
        callTargets: {
        }
      };

      // Append to global array
      peerConns.push(this.report);


      callAveragesArray.push({ "callAverages": this.calculations.callAverages, "callTargets": this.calculations.callTargets });



      console.warn("PeerConnection instantiated", this.report);

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

      // Here we store the previous filtered report period. This is used to calculate per second metrics.
      previousFilteredReports[this.report.connection_id] = { ...currentFilteredReports[this.report.connection_id] };
      // This contains all of the metrics that we would expect from rtcStats
      rawReports[this.report.connection_id] = {
        clientId: _config.client_id,
        testId: _config.test_id,
        connectionId: this.report.connection_id,
        reportNum: this.report.report_num,
        ...rtcdata,
      };
      // Filter data from the raw reports we're getting from rtcStats. We're only interested in certain types of metrics.
      currentFilteredReports[this.report.connection_id] = filterPeriodMetrics(rawReports[this.report.connection_id], TYPES_TO_KEEP, KINDS_TO_KEEP, SSRC_TO_REMOVE, KEYS_TO_KEEP);
      // Then calculate the per second metrics based on the filtered reports. Report also contains targets.
      // Here we grab the previous per second report period. This is used to calculate smoothness.
      previousPerSecondReport[this.report.connection_id] = { ...currentPerSecondReport[this.report.connection_id] };
      // Here we calculate the per second metrics based on the current and previous filtered reports.
      currentPerSecondReport[this.report.connection_id] = calculatePerSecondMetrics(currentFilteredReports[this.report.connection_id], previousFilteredReports[this.report.connection_id], CUMULATIVE_KEYS, KEYS_TO_KEEP_AFTER_PER_SECOND_CALCULATIONS, TARGETS, this.report.connection_id);
      // If the per second reports are not empty, push them to the batch array. Reports may be empty because of peer connections that do not contain metrics we're interested in.
      if (!isObjectEmpty(currentPerSecondReport[this.report.connection_id])) {
        let metricsWithSmoothness = {}
        this.calculations.smoothnessBuffer.push(currentPerSecondReport[this.report.connection_id]);
        if (this.calculations.smoothnessBuffer.length > _config.frameRatePeriodChange) {
          this.calculations.smoothnessBuffer.shift();
        }
        // Here we add the smoothness metric to the per second report. It is currently based on the current per second metric, and the previous per second metric.
        metricsWithSmoothness = calculateSmoothness(this.calculations.smoothnessBuffer, _config.frameRatePeriodChange, _config.frameRateDelta, this.calculations.callAverages);
        //calculateSmoothness(currentPerSecondReport[this.report.connection_id], previousPerSecondReport[this.report.connection_id]);
        this.report.batch.push(metricsWithSmoothness);

        this.report.report_num += 1;
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
      const callTargetCollection = callAveragesArray
        .filter((ca) => Object.keys(ca.callAverages).length)
      if (batchCollection.length) {
        logBatch(batchCollection);
        logCallTarget(callTargetCollection);
      }
    }, _config.log_interval * 1000);
  }
}
