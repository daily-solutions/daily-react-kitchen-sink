// rtcStats.js
import { createProvider, logTransformedData, storePeriod, logStoredPeriods, logAggregatedStats } from './rtcStatsUtils';

/**
 * @typedef {Object} RTCStatsConfig
 * @property {number} reportInterval - Interval for reporting stats in seconds
 * @property {number} logInterval - Interval for logging stats in seconds
 * @property {string} testId - Unique identifier for the test
 * @property {string} clientId - Unique identifier for the client
 */

/**
 * @type {RTCStatsConfig}
 */
const DEFAULT_CONFIG = {
  reportInterval: 1,
  logInterval: 5,
  testId: '',
  clientId: '',
};

/**
 * RTCStats class for managing WebRTC statistics
 */
class RTCStats {
  /**
   * @param {string} providerName - Name of the WebRTC provider (e.g., 'daily', 'twilio')
   * @param {Partial<RTCStatsConfig>} config - Configuration options
   */
  constructor(providerName, config = {}) {
    if (window.rtcstats) {
      console.warn("[RTCStats] Already declared");
      return;
    }

    window.rtcstats = this;

    this.config = { ...DEFAULT_CONFIG, ...config };
    this.config.testId = this.config.testId || crypto.randomUUID();
    this.config.clientId = this.config.clientId || crypto.randomUUID();

    this.provider = createProvider(providerName);
    this.peerConns = new WeakSet();
    this.peerConnsArray = []; // New array to store references
    this.transformedStatsArray = [];
    this.previousReports = new Map();

    this.initializePeerConnection();
  }

  /**
   * Initialize custom RTCPeerConnection
   */
  initializePeerConnection() {
    const originalRTCPeerConnection = window.RTCPeerConnection;
    const self = this;

    window.RTCPeerConnection = class extends originalRTCPeerConnection {
      constructor(config) {
        super(config);
        this.rtcStatsData = {
          connectionId: crypto.randomUUID(),
          reportNum: 0,
          batch: []
        };
        self.peerConns.add(this);
        self.peerConnsArray.push(this); // Add to array

        console.log("[RTCStats] PeerConnection instantiated", this);

        this.addEventListener("connectionstatechange", this.handleConnectionStateChange.bind(this));
      }

      handleConnectionStateChange() {
        console.log("[RTCStats] Connection state changed to:", this.connectionState);
        if (this._statsInterval) {
          clearInterval(this._statsInterval);
        }

        if (this.connectionState === "connected") {
          this.getStats().then(this.processStats.bind(this));
          this._statsInterval = setInterval(() => {
            if (this.connectionState !== "connected") {
              clearInterval(this._statsInterval);
              return;
            }
            this.getStats().then(this.processStats.bind(this));
          }, self.config.reportInterval * 1000);
        }
      }

      processStats(stats) {
        console.info("[RTCStats] Processing stats...");
        const rtcdata = Object.fromEntries(stats.entries());
        if (!rtcdata) return;
        this.rtcStatsData.batch.push({
          clientId: self.config.clientId,
          testId: self.config.testId,
          connectionId: this.rtcStatsData.connectionId,
          reportNum: this.rtcStatsData.reportNum,
          ...rtcdata,
        });

        this.rtcStatsData.reportNum += 1;
        console.log("[RTCStats] Batch size:", this.rtcStatsData.batch.length);
      }
    };
  }

  /**
   * Store raw WebRTC stats
   * @param {Object[]} reportArray
   */
  async store(reportArray) {
    console.info("[RTCStats] Logging raw data...", reportArray);
    // Implement storage logic here
  }

  /**
   * Log batch of WebRTC stats
   * @param {Object[][]} batchCollection
   */
  async logBatch(batchCollection) {
    console.log("[RTCStats] Logging batch...")
    const reportArray = batchCollection.flatMap(batch =>
      batch.splice(0, batch.length).map(data => ({
        clientId: this.config.clientId,
        testId: this.config.testId,
        connectionId: data.connectionId,
        reportNum: data.reportNum,
        ...data,
      }))
    );

    if (!reportArray.length) return;

    await this.store(reportArray);

    const transformedData = this.provider.transformStats(reportArray, this.previousReports);
    this.transformedStatsArray.push(transformedData);

    storePeriod(transformedData);
  }

  /**
   * Log transformed and aggregated stats
   */
  logTransformedAndAggregatedStats() {
    logTransformedData(this.transformedStatsArray);
    this.transformedStatsArray = [];
    logStoredPeriods();
    logAggregatedStats();
  }

  /**
   * Start logging stats
   */
  startLogging() {
    console.log("[RTCStats] Start logging stats...");
    this.loggingInterval = setInterval(() => {
      console.log("[RTCStats] Logging interval triggered");

      if (this.peerConnsArray.length === 0) {
        console.log("[RTCStats] No peer connections available");
        return;
      }

      console.log("[RTCStats] peerConns size:", this.peerConnsArray.length);

      const batchCollection = this.peerConnsArray
        .filter(pc => pc.rtcStatsData && pc.rtcStatsData.batch && pc.rtcStatsData.batch.length > 0)
        .map(pc => pc.rtcStatsData.batch);

      console.log("[RTCStats] batchCollection size:", batchCollection.length);
      console.log("[RTCStats] First batch size (if exists):", batchCollection[0]?.length);

      if (batchCollection.length) {
        this.logBatch(batchCollection);
        this.logTransformedAndAggregatedStats();

        // Clear batches after processing
        this.peerConnsArray.forEach(pc => {
          if (pc.rtcStatsData) {
            pc.rtcStatsData.batch = [];
          }
        });
      } else {
        console.log("[RTCStats] No batches to process");
      }
    }, this.config.logInterval * 1000);
  }

  /**
   * Stop logging stats
   */
  stopLogging() {
    if (this.loggingInterval) {
      clearInterval(this.loggingInterval);
    }
  }
}

/**
 * Initialize RTCStats
 * @param {string} providerName - Name of the WebRTC provider
 * @param {Partial<RTCStatsConfig>} config - Configuration options
 */
export function initializeRTCStats(providerName, config = {}) {
  const rtcStats = new RTCStats(providerName, config);
  rtcStats.startLogging();
  return rtcStats;
}