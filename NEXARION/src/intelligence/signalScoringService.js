class SignalScoringService {
  static normalize(value, max) {
    if (max <= 0) return 0;
    return Math.max(0, Math.min(1, value / max));
  }

  constructor() {}

  score(signal) {
    const walletQuality = Number(signal.walletScore ?? 0.5);
    const liquidity = Number(signal.liquidityUsd ?? 0);
    const volume = Number(signal.volumeUsd ?? 0);
    const launchAgeHours = Number(signal.launchAgeHours ?? 48);
    const clusterConfidence = Number(signal.clusterConfidence ?? 0);

    const liquidityScore = SignalScoringService.normalize(Math.log10(liquidity + 1), 4.5);
    const volumeScore = SignalScoringService.normalize(Math.log10(volume + 1), 5.5);
    const launchAgeScore = Math.max(0, Math.min(1, 1 - launchAgeHours / 72));
    const clusterScore = Math.max(0, Math.min(1, clusterConfidence));

    const totalScore =
      walletQuality * 0.35 +
      liquidityScore * 0.25 +
      volumeScore * 0.2 +
      launchAgeScore * 0.15 +
      clusterScore * 0.05;

    return Number((totalScore * 10).toFixed(2));
  }
}

module.exports = SignalScoringService;
