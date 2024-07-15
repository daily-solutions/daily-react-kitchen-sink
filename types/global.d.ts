/** @format */

// global.d.ts

export {};

declare global {
	interface Window {
		rtcstatsInitialized: boolean;
		rtcstats: any; // or a more specific type if you have one for rtcstats
	}
}
