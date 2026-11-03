/**
 * Recorded Hyperliquid Info API payloads (trimmed).
 * Captured from POST https://api.hyperliquid.xyz/info — no live network in tests.
 */

export const recordedMetaAndAssetCtxs = [
  {
    universe: [
      { szDecimals: 5, name: 'BTC', maxLeverage: 40, marginTableId: 56 },
      { szDecimals: 4, name: 'ETH', maxLeverage: 25, marginTableId: 55 },
      { szDecimals: 0, name: 'kPEPE', maxLeverage: 10, marginTableId: 52 },
      {
        szDecimals: 0,
        name: 'HPOS',
        maxLeverage: 3,
        marginTableId: 3,
        onlyIsolated: true,
        isDelisted: true,
        marginMode: 'strictIsolated',
      },
    ],
    marginTables: [],
    collateralToken: 0,
  },
  [
    {
      funding: '0.0000125',
      openInterest: '40007.61334',
      prevDayPx: '78227.0',
      dayNtlVlm: '2721541002.9207310677',
      premium: '-0.0003449914',
      oraclePx: '76813.5',
      markPx: '76786.0',
      midPx: '76786.5',
      impactPxs: ['76786.0', '76787.0'],
      dayBaseVlm: '35240.85152',
    },
    {
      funding: '0.0000125',
      openInterest: '993473.7896000003',
      prevDayPx: '2297.9',
      dayNtlVlm: '968172510.8035005331',
      premium: '-0.0000972118',
      oraclePx: '2263.1',
      markPx: '2262.54',
      midPx: '2262.75',
      impactPxs: ['2262.7', '2262.88'],
      dayBaseVlm: '427051.2665999999',
    },
    {
      funding: '0.0000125',
      openInterest: '11437869700.0',
      prevDayPx: '0.00488',
      dayNtlVlm: '28833437.261475008',
      premium: '-0.0002126302',
      oraclePx: '0.004703',
      markPx: '0.0047',
      midPx: '0.0047',
      impactPxs: ['0.004699', '0.004702'],
      dayBaseVlm: '6067811544.0',
    },
    {
      funding: '0.0',
      openInterest: '0.0',
      prevDayPx: '0.041845',
      dayNtlVlm: '0.0',
      premium: null,
      oraclePx: '0.042203',
      markPx: '0.041873',
      midPx: null,
      impactPxs: null,
      dayBaseVlm: '0.0',
    },
  ],
];

export const recordedFundingHistory = [
  { coin: 'ETH', fundingRate: '0.0000125', premium: '-0.00012', time: 1793613600000 },
  { coin: 'ETH', fundingRate: '0.0000180', premium: '-0.00008', time: 1793617200000 },
  { coin: 'ETH', fundingRate: '0.0000090', premium: '-0.00020', time: 1793620800000 },
  { coin: 'ETH', fundingRate: '-0.0000040', premium: '0.00005', time: 1793624400000 },
  { coin: 'ETH', fundingRate: '0.0000125', premium: '-0.00028', time: 1793628000000 },
  { coin: 'ETH', fundingRate: '0.0000125', premium: '-0.00029', time: 1793631600000 },
];
